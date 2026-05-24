import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function activeTenant(supabase: any, userId: string): Promise<string | null> {
  const { data } = await supabase
    .from("profiles")
    .select("active_tenant_id")
    .eq("id", userId)
    .maybeSingle();
  return data?.active_tenant_id ?? null;
}

/** Sinh đề xuất bút toán + cache vào ai_journal_proposals. */
export const proposeJournal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        invoice_id: z.string().uuid(),
        invoice_kind: z.enum(["purchase", "sales"]).default("purchase"),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const tenantId = await activeTenant(supabase, userId);
    if (!tenantId) throw new Error("Chưa chọn doanh nghiệp");
    const t0 = Date.now();
    let dto;
    if (data.invoice_kind === "sales") {
      const { proposeJournalForSalesInvoice } = await import("./categorize/sales-engine.server");
      dto = await proposeJournalForSalesInvoice(supabase, data.invoice_id);
    } else {
      const { proposeJournalForInvoice } = await import("./categorize/engine.server");
      dto = await proposeJournalForInvoice(supabase, data.invoice_id);
    }
    const duration = Date.now() - t0;

    await supabase
      .from("ai_journal_proposals")
      .upsert(
        {
          tenant_id: tenantId,
          invoice_id: data.invoice_id,
          invoice_kind: data.invoice_kind,
          dto: dto as any,
          confidence: dto.confidence,
          source: dto.source,
          warnings: dto.warnings as any,
          status: "pending",
        },
        { onConflict: "invoice_kind,invoice_id" },
      );

    try {
      const { tryLogAgentActivity } = await import("@/lib/ai-agents.server");
      await tryLogAgentActivity(supabase, userId, {
        agent_id: "categorize",
        action: `Đề xuất bút toán ${data.invoice_kind === "sales" ? "(bán)" : "(mua)"} (${dto.source}, ${Math.round(dto.confidence * 100)}%)`,
        result: dto.warnings.some((w) => w.severity === "error") ? "warning" : "success",
        duration_ms: duration,
        metadata: { invoice_id: data.invoice_id, invoice_kind: data.invoice_kind, entries: dto.entries.length },
      });
    } catch {}

    return dto;
  });

/** List proposal đang chờ + dữ liệu invoice meta để render UI hàng đợi. */
export const listProposals = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        status: z.enum(["pending", "approved", "skipped", "auto_posted", "failed", "all"]).default("pending"),
        min_confidence: z.number().min(0).max(1).optional(),
        source: z.enum(["vendor_template", "learned_lines", "classify_rule", "ai_fallback", "manual"]).optional(),
        limit: z.number().int().min(1).max(200).default(50),
      })
      .parse(i ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const tenantId = await activeTenant(supabase, userId);
    if (!tenantId) return { items: [], stats: { pending: 0, auto_today: 0, accuracy_7d: null } };

    let q = supabase
      .from("ai_journal_proposals")
      .select("id, invoice_id, dto, confidence, source, status, warnings, auto_posted, journal_entry_id, created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.status !== "all") q = q.eq("status", data.status);
    if (data.source) q = q.eq("source", data.source);
    if (data.min_confidence != null) q = q.gte("confidence", data.min_confidence);

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const invoiceIds = Array.from(new Set(((rows ?? []) as any[]).map((r) => r.invoice_id)));
    const invMap = new Map<string, any>();
    if (invoiceIds.length > 0) {
      const { data: invs } = await supabase
        .from("invoices")
        .select("id, supplier_name, supplier_tax_id, total, invoice_no, issue_date, status, file_path")
        .in("id", invoiceIds);
      for (const i of (invs ?? []) as any[]) invMap.set(i.id, i);
    }

    const items = ((rows ?? []) as any[]).map((r) => ({
      id: r.id,
      invoice_id: r.invoice_id,
      invoice: invMap.get(r.invoice_id) ?? null,
      dto: r.dto,
      confidence: Number(r.confidence),
      source: r.source,
      status: r.status,
      warnings: r.warnings,
      journal_entry_id: r.journal_entry_id,
      created_at: r.created_at,
    }));

    // stats
    const since = new Date(Date.now() - 86400000).toISOString();
    const { count: autoToday } = await supabase
      .from("ai_journal_proposals")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("status", "auto_posted")
      .gte("created_at", since);

    return {
      items,
      stats: {
        pending: items.filter((x) => x.status === "pending").length,
        auto_today: autoToday ?? 0,
        accuracy_7d: null as number | null,
      },
    };
  });

/** Duyệt proposal → ghi sổ + học vendor template. */
export const approveProposal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        proposal_id: z.string().uuid(),
        entry_index: z.number().int().min(0).default(0),
        edits: z
          .object({
            description: z.string().max(500).optional(),
            entry_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
            lines: z
              .array(
                z.object({
                  account_code: z.string().min(2).max(16),
                  debit: z.number().min(0),
                  credit: z.number().min(0),
                  memo: z.string().max(200).optional(),
                }),
              )
              .min(2)
              .optional(),
          })
          .optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const tenantId = await activeTenant(supabase, userId);
    if (!tenantId) throw new Error("Chưa chọn doanh nghiệp");

    const { data: p } = await supabase
      .from("ai_journal_proposals")
      .select("id, invoice_id, invoice_kind, dto, status")
      .eq("id", data.proposal_id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!p) throw new Error("Không tìm thấy đề xuất");
    if (p.status !== "pending") throw new Error(`Đề xuất đã ${p.status}`);

    const entry = data.edits?.lines
      ? {
          description: data.edits.description ?? (p.dto as any).entries[data.entry_index].description,
          entry_date: data.edits.entry_date ?? (p.dto as any).entries[data.entry_index].entry_date,
          lines: data.edits.lines,
        }
      : (p.dto as any).entries[data.entry_index];

    const totalD = entry.lines.reduce((s: number, l: any) => s + Number(l.debit || 0), 0);
    const totalC = entry.lines.reduce((s: number, l: any) => s + Number(l.credit || 0), 0);
    if (Math.abs(totalD - totalC) > 0.5) throw new Error(`Bút toán không cân: Nợ ${totalD} ≠ Có ${totalC}`);

    const { data: locked } = await supabase.rpc("is_period_locked", {
      _user_id: userId,
      _date: entry.entry_date,
    });
    if (locked === true) throw new Error("Kỳ kế toán đã khoá");

    const isSales = p.invoice_kind === "sales";
    const { data: je, error: je_err } = await supabase
      .from("journal_entries")
      .insert({
        user_id: userId,
        tenant_id: tenantId,
        // journal_entries.invoice_id chỉ FK tới invoices (mua); với sales để null và liên kết qua sales_invoices.journal_entry_id
        invoice_id: isSales ? null : p.invoice_id,
        entry_date: entry.entry_date,
        description: entry.description,
      })
      .select("id")
      .single();
    if (je_err || !je) throw new Error(je_err?.message || "Không tạo được bút toán");

    const { error: jl_err } = await supabase.from("journal_lines").insert(
      entry.lines.map((l: any, i: number) => ({
        entry_id: je.id,
        account_code: l.account_code,
        debit: l.debit,
        credit: l.credit,
        line_order: i,
      })),
    );
    if (jl_err) throw new Error(jl_err.message);

    await supabase
      .from("ai_journal_proposals")
      .update({
        status: "approved",
        journal_entry_id: je.id,
        resolved_at: new Date().toISOString(),
        resolved_by: userId,
      })
      .eq("id", data.proposal_id);

    if (isSales) {
      await supabase
        .from("sales_invoices")
        .update({ journal_entry_id: je.id, status: "posted" })
        .eq("id", p.invoice_id);
    } else {
      await supabase.from("invoices").update({ status: "approved" }).eq("id", p.invoice_id);
    }

    try {
      const { tryLogAgentActivity } = await import("@/lib/ai-agents.server");
      if (!isSales) {
        const { learnVendorTemplate } = await import("./categorize/templates.server");
        const learn = await learnVendorTemplate(supabase, tenantId, p.invoice_id);
        await tryLogAgentActivity(supabase, userId, {
          agent_id: "categorize",
          action: learn.learned
            ? `Học template NCC (mẫu thứ ${learn.sample_count})`
            : `Duyệt bút toán mua — ${entry.description.slice(0, 80)}`,
          result: "success",
          metadata: { entry_id: je.id, invoice_id: p.invoice_id, learned: learn.learned },
        });
      } else {
        await tryLogAgentActivity(supabase, userId, {
          agent_id: "categorize",
          action: `Duyệt bút toán bán — ${entry.description.slice(0, 80)}`,
          result: "success",
          metadata: { entry_id: je.id, sales_invoice_id: p.invoice_id },
        });
      }
    } catch {}

    try {
      const { invalidateCategorizeCache } = await import("./categorize/cache.server");
      invalidateCategorizeCache(tenantId);
    } catch {}

    return { ok: true, journal_entry_id: je.id };
  });

export const skipProposal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ proposal_id: z.string().uuid(), reason: z.string().max(300).optional() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const tenantId = await activeTenant(supabase, userId);
    if (!tenantId) throw new Error("Chưa chọn doanh nghiệp");
    await supabase
      .from("ai_journal_proposals")
      .update({ status: "skipped", resolved_at: new Date().toISOString(), resolved_by: userId })
      .eq("id", data.proposal_id)
      .eq("tenant_id", tenantId);
    try {
      const { invalidateCategorizeCache } = await import("./categorize/cache.server");
      invalidateCategorizeCache(tenantId);
    } catch {}
    return { ok: true };
  });

/** Lấy proposal hiện tại theo invoice_id (dùng trong Sheet tài liệu). */
export const getProposalByInvoice = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ invoice_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const tenantId = await activeTenant(supabase, userId);
    if (!tenantId) return { proposal: null };
    const { data: row } = await supabase
      .from("ai_journal_proposals")
      .select("id, invoice_id, dto, confidence, source, status, warnings, journal_entry_id, auto_posted, created_at, resolved_at")
      .eq("tenant_id", tenantId)
      .eq("invoice_id", data.invoice_id)
      .maybeSingle();
    return { proposal: row ?? null };
  });

/** Wrapper gọi từ parse-document: nếu agent.mode=auto + conf đủ thì auto-post luôn. */
export const autoPostIfEligible = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ invoice_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const tenantId = await activeTenant(supabase, userId);
    if (!tenantId) return { auto_posted: false };
    const { proposeJournalForInvoice } = await import("./categorize/engine.server");
    const dto = await proposeJournalForInvoice(supabase, data.invoice_id);

    await supabase
      .from("ai_journal_proposals")
      .upsert(
        {
          tenant_id: tenantId,
          invoice_id: data.invoice_id,
          dto: dto as any,
          confidence: dto.confidence,
          source: dto.source,
          warnings: dto.warnings as any,
          status: dto.recommend_auto_post ? "pending" : "pending",
        },
        { onConflict: "invoice_id" },
      );

    if (!dto.recommend_auto_post) return { auto_posted: false, confidence: dto.confidence };

    // Ghi sổ entry đầu (vendor template hoặc entry duy nhất)
    const entry = dto.entries[0];
    const { data: je } = await supabase
      .from("journal_entries")
      .insert({
        user_id: userId,
        tenant_id: tenantId,
        invoice_id: data.invoice_id,
        entry_date: entry.entry_date,
        description: `[Auto] ${entry.description}`,
      })
      .select("id")
      .single();
    if (!je) return { auto_posted: false };

    await supabase.from("journal_lines").insert(
      entry.lines.map((l, i) => ({
        entry_id: je.id,
        account_code: l.account_code,
        debit: l.debit,
        credit: l.credit,
        line_order: i,
      })),
    );
    await supabase
      .from("ai_journal_proposals")
      .update({
        status: "auto_posted",
        auto_posted: true,
        journal_entry_id: je.id,
        resolved_at: new Date().toISOString(),
      })
      .eq("invoice_id", data.invoice_id);
    await supabase.from("invoices").update({ status: "approved" }).eq("id", data.invoice_id);

    try {
      const { tryLogAgentActivity } = await import("@/lib/ai-agents.server");
      await tryLogAgentActivity(supabase, userId, {
        agent_id: "categorize",
        action: `Auto-post HĐ (${dto.source}, ${Math.round(dto.confidence * 100)}%)`,
        result: "success",
        metadata: { invoice_id: data.invoice_id, entry_id: je.id },
      });
    } catch {}

    return { auto_posted: true, journal_entry_id: je.id, confidence: dto.confidence };
  });
