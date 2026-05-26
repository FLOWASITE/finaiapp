import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveActiveTenantId } from "@/lib/auth/active-tenant.server";

const getTenant = (supabase: any, userId: string) =>
  resolveActiveTenantId(supabase, userId);

export const emitManualFeedback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        eventType: z.enum([
          "wrong_account",
          "wrong_amount",
          "wrong_partner",
          "wrong_vat",
          "duplicate",
          "missed_entry",
        ]),
        journalEntryId: z.string().uuid().optional().nullable(),
        bankTransactionId: z.string().uuid().optional().nullable(),
        proposalId: z.string().uuid().optional().nullable(),
        severity: z.number().min(0).max(1).optional(),
        note: z.string().max(500).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const tenantId = await getTenant(supabase, userId);
    if (!tenantId) throw new Error("Chưa chọn doanh nghiệp");
    const { emitFeedback } = await import("./emit.server");
    return await emitFeedback(supabase, {
      tenantId,
      sourceAgent: "manual",
      eventType: data.eventType,
      severity: data.severity,
      journalEntryId: data.journalEntryId ?? null,
      bankTransactionId: data.bankTransactionId ?? null,
      proposalId: data.proposalId ?? null,
      note: data.note,
      createdBy: userId,
    });
  });

export const listFeedbackEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        source: z.enum(["all", "reconcile", "review", "manual"]).default("all"),
        days: z.number().int().min(1).max(180).default(30),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const tenantId = await getTenant(supabase, userId);
    if (!tenantId) return [];
    const fromIso = new Date(Date.now() - data.days * 86400000).toISOString();
    let q = supabase
      .from("agent_feedback_events")
      .select("*")
      .eq("tenant_id", tenantId)
      .gte("created_at", fromIso)
      .order("created_at", { ascending: false })
      .limit(200);
    if (data.source !== "all") q = q.eq("source_agent", data.source);
    const { data: rows } = await q;
    return rows ?? [];
  });

export const listPenalties = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ onlyDemoted: z.boolean().default(false) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const tenantId = await getTenant(supabase, userId);
    if (!tenantId) return [];
    let q = supabase
      .from("ai_rule_penalties")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("penalty_score", { ascending: false })
      .limit(200);
    if (data.onlyDemoted) q = q.not("auto_demoted_at", "is", null);
    const { data: rows } = await q;
    // join name from ai_memory_rules (best-effort)
    const ruleIds = (rows ?? [])
      .filter((r: any) => r.target_kind === "rule")
      .map((r: any) => r.target_id);
    let nameMap = new Map<string, string>();
    if (ruleIds.length) {
      const { data: rs } = await supabase
        .from("ai_memory_rules")
        .select("id, title, mode, status")
        .in("id", ruleIds);
      nameMap = new Map((rs ?? []).map((r: any) => [r.id, r]));
    }
    return (rows ?? []).map((r: any) => ({
      ...r,
      target_info: nameMap.get(r.target_id) ?? null,
    }));
  });

export const restorePenalty = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ penaltyId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const tenantId = await getTenant(supabase, userId);
    if (!tenantId) throw new Error("Chưa chọn doanh nghiệp");
    const isAdmin = await supabase.rpc("has_tenant_role", {
      _user_id: userId,
      _tenant_id: tenantId,
      _roles: ["owner", "admin"],
    });
    if (!isAdmin.data) throw new Error("Chỉ chủ sở hữu / quản trị mới được khôi phục");

    const { data: p } = await supabase
      .from("ai_rule_penalties")
      .select("*")
      .eq("id", data.penaltyId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!p) throw new Error("Không tìm thấy");

    if (p.target_kind === "rule" && p.auto_demoted_at) {
      await supabase
        .from("ai_memory_rules")
        .update({ mode: "suggest", status: "active", enabled: true, disable_reason: null })
        .eq("id", p.target_id);
    }
    await supabase
      .from("ai_rule_penalties")
      .update({
        penalty_score: 0,
        wrong_count: 0,
        auto_demoted_at: null,
        auto_demoted_reason: null,
      })
      .eq("id", data.penaltyId);
    return { ok: true };
  });
