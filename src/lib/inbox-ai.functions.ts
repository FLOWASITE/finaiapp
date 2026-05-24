import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  buildBankItem,
  buildDocumentItem,
  buildInsightItem,
  loadActiveRules,
  type InboxItem,
} from "@/lib/ai/inbox-reason.server";

async function activeTenant(supabase: any, userId: string): Promise<string | null> {
  const { data } = await supabase
    .from("profiles")
    .select("active_tenant_id")
    .eq("id", userId)
    .maybeSingle();
  return data?.active_tenant_id ?? null;
}

const ListInput = z.object({
  tab: z.enum(["inbox", "posted", "review", "documents"]).default("inbox"),
  search: z.string().max(200).optional().default(""),
  limit: z.number().int().min(1).max(100).optional().default(40),
});

export const listInboxAi = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => ListInput.parse(i ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const tenantId = await activeTenant(supabase, userId);
    if (!tenantId) return { items: [], stats: { pending: 0, posted_today: 0, accuracy: null } };
    const rules = await loadActiveRules(supabase, tenantId);

    // Pull recent sources in parallel
    const [docsRes, txnsRes, insightsRes, banksRes, postedRes] = await Promise.all([
      supabase
        .from("documents")
        .select("id, original_filename, doc_kind, ocr_status, ocr_extracted, source, created_at")
        .eq("tenant_id", tenantId)
        .in("ocr_status", ["done", "processing"])
        .order("created_at", { ascending: false })
        .limit(40),
      supabase
        .from("bank_transactions")
        .select("id, bank_account_id, txn_date, description, amount, counterparty, status, created_at")
        .eq("tenant_id", tenantId)
        .eq("status", "unmatched")
        .order("txn_date", { ascending: false })
        .limit(40),
      supabase
        .from("ai_insights")
        .select("id, title, body, severity, created_at, metadata, category, action_url")
        .eq("tenant_id", tenantId)
        .is("dismissed_at", null)
        .order("created_at", { ascending: false })
        .limit(20),
      supabase.from("bank_accounts").select("id, name, bank_name, account_no").eq("tenant_id", tenantId),
      supabase
        .from("journal_entries")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .gte("created_at", new Date(Date.now() - 86400000).toISOString()),
    ]);

    const bankMap = new Map(
      ((banksRes.data ?? []) as any[]).map((a) => [
        a.id,
        `${a.bank_name ?? a.name}${a.account_no ? " ··" + String(a.account_no).slice(-4) : ""}`,
      ]),
    );

    const items: InboxItem[] = [];
    for (const d of (docsRes.data ?? []) as any[]) {
      const it = await buildDocumentItem(supabase, tenantId, d, rules);
      if (it) items.push(it);
    }
    for (const t of (txnsRes.data ?? []) as any[]) {
      const it = await buildBankItem(supabase, tenantId, t, bankMap.get(t.bank_account_id) ?? "Ngân hàng", rules);
      if (it) items.push(it);
    }
    for (const i of (insightsRes.data ?? []) as any[]) items.push(buildInsightItem(i));

    const q = data.search.trim().toLowerCase();
    const filtered = q
      ? items.filter(
          (x) =>
            x.title.toLowerCase().includes(q) ||
            (x.subtitle ?? "").toLowerCase().includes(q) ||
            (x.partner ?? "").toLowerCase().includes(q),
        )
      : items;

    // Sort: low confidence (red) first, then medium, then high; within band newest first
    const order: Record<string, number> = { low: 0, medium: 1, high: 2 };
    filtered.sort((a, b) => {
      const ab = order[a.confidence_band] - order[b.confidence_band];
      if (ab !== 0) return ab;
      return new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime();
    });

    const top = filtered.slice(0, data.limit);
    return {
      items: top,
      stats: {
        pending: filtered.length,
        posted_today: postedRes.count ?? 0,
        accuracy: null as number | null,
        high_conf_count: filtered.filter((x) => x.confidence_band === "high").length,
      },
    };
  });

const ApproveInput = z.object({
  source: z.enum(["document", "bank_statement", "ai_insight"]),
  external_id: z.string().min(1),
  description: z.string().min(1).max(500),
  entry_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  lines: z
    .array(
      z.object({
        account_code: z.string().min(2).max(16),
        debit: z.number().min(0),
        credit: z.number().min(0),
        memo: z.string().max(200).optional(),
      }),
    )
    .min(1),
  confidence_at_decision: z.number().int().min(0).max(100).optional(),
  match_ref_invoice_id: z.string().uuid().optional(),
});

export const approveInboxItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => ApproveInput.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const tenantId = await activeTenant(supabase, userId);
    if (!tenantId) throw new Error("Chưa chọn doanh nghiệp hoạt động");

    const totalDebit = data.lines.reduce((s, l) => s + Number(l.debit || 0), 0);
    const totalCredit = data.lines.reduce((s, l) => s + Number(l.credit || 0), 0);
    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      throw new Error(`Bút toán không cân: Nợ ${totalDebit} ≠ Có ${totalCredit}`);
    }
    const { data: locked } = await supabase.rpc("is_period_locked", {
      _user_id: userId,
      _date: data.entry_date,
    });
    if (locked === true) throw new Error("Kỳ kế toán đã khoá");

    const { data: entry, error } = await supabase
      .from("journal_entries")
      .insert({
        user_id: userId,
        tenant_id: tenantId,
        entry_date: data.entry_date,
        description: data.description,
        invoice_id: data.match_ref_invoice_id ?? null,
      })
      .select("id")
      .single();
    if (error || !entry) throw new Error(error?.message || "Không tạo được bút toán");

    const { error: linesErr } = await supabase.from("journal_lines").insert(
      data.lines.map((l, i) => ({
        entry_id: entry.id,
        account_code: l.account_code,
        debit: l.debit,
        credit: l.credit,
        line_order: i,
      })),
    );
    if (linesErr) throw new Error(linesErr.message);

    // Mark source as handled
    if (data.source === "bank_statement") {
      await supabase
        .from("bank_transactions")
        .update({ status: "matched", matched_entry_id: entry.id })
        .eq("id", data.external_id);
    } else if (data.source === "document") {
      await supabase
        .from("documents")
        .update({ ocr_status: "done", reviewed_at: new Date().toISOString(), reviewed_by: userId })
        .eq("id", data.external_id);
    } else if (data.source === "ai_insight") {
      await supabase
        .from("ai_insights")
        .update({ dismissed_at: new Date().toISOString(), dismissed_by: userId })
        .eq("id", data.external_id);
    }

    await supabase.from("inbox_decisions").insert({
      tenant_id: tenantId,
      user_id: userId,
      item_source: data.source,
      item_external_id: data.external_id,
      action: "approve",
      confidence_at_decision: data.confidence_at_decision ?? null,
      final_entry: { description: data.description, entry_date: data.entry_date, lines: data.lines } as any,
      journal_entry_id: entry.id,
    });

    try {
      const { tryLogAgentActivity } = await import("@/lib/ai-agents.server");
      await tryLogAgentActivity(supabase, userId, {
        agent_id: "categorize",
        action: `Hạch toán ${data.source === "bank_statement" ? "giao dịch NH" : data.source === "document" ? "chứng từ" : "đề xuất"} — ${data.description.slice(0, 80)}`,
        result: "success",
        metadata: { entry_id: entry.id, confidence: data.confidence_at_decision ?? null },
      });
    } catch {}

    return { journal_entry_id: entry.id };
  });

const SkipInput = z.object({
  source: z.enum(["document", "bank_statement", "ai_insight"]),
  external_id: z.string().min(1),
  reason: z.string().max(500).optional(),
});

export const skipInboxItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => SkipInput.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const tenantId = await activeTenant(supabase, userId);
    if (!tenantId) throw new Error("Chưa chọn doanh nghiệp hoạt động");
    if (data.source === "ai_insight") {
      await supabase
        .from("ai_insights")
        .update({ dismissed_at: new Date().toISOString(), dismissed_by: userId })
        .eq("id", data.external_id);
    }
    await supabase.from("inbox_decisions").insert({
      tenant_id: tenantId,
      user_id: userId,
      item_source: data.source,
      item_external_id: data.external_id,
      action: "skip",
      note: data.reason ?? null,
    });
    return { ok: true };
  });

const RuleInput = z.object({
  source: z.enum(["document", "bank_statement", "ai_insight"]),
  external_id: z.string().min(1),
  pattern_kind: z.enum(["partner", "memo", "source", "amount_range", "partner_amount"]),
  pattern_value: z.string().min(1).max(200),
  apply_account: z.string().min(2).max(16).optional(),
  apply_dimension: z.record(z.string(), z.unknown()).optional(),
  confidence_boost: z.number().int().min(0).max(100).optional(),
  note: z.string().max(300).optional(),
});

export const saveInboxRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => RuleInput.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const tenantId = await activeTenant(supabase, userId);
    if (!tenantId) throw new Error("Chưa chọn doanh nghiệp hoạt động");
    const { data: row, error } = await supabase
      .from("inbox_rules")
      .insert({
        tenant_id: tenantId,
        user_id: userId,
        pattern_kind: data.pattern_kind,
        pattern_value: data.pattern_value,
        apply_account: data.apply_account ?? null,
        apply_dimension: (data.apply_dimension ?? {}) as any,
        confidence_boost: data.confidence_boost ?? 25,
        note: data.note ?? null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row!.id };
  });
