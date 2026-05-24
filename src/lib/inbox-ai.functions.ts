import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  buildBankItem,
  buildDocumentItem,
  buildInsightItem,
  buildSalesInvoiceItem,
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

/**
 * Materialize a row in `sales_invoices` (+ lines) from a parsed XML e-invoice
 * document, so it shows up in "Trung tâm bán hàng → Hoá đơn bán" after the
 * user duyệt & ghi sổ in Inbox AI. Idempotent: returns existing id if already
 * linked or matching (tenant_id, invoice_no, customer_tax_id).
 */
async function materializeSalesInvoiceFromDocument(
  supabase: any,
  opts: {
    documentId: string;
    tenantId: string;
    userId: string;
    entryDate: string;
    journalEntryId: string;
  },
): Promise<string | null> {
  const { documentId, tenantId, userId, entryDate, journalEntryId } = opts;

  const { data: doc } = await supabase
    .from("documents")
    .select("id, doc_kind, ai_upload_id, sales_invoice_id, original_filename")
    .eq("id", documentId)
    .maybeSingle();
  if (!doc || doc.doc_kind !== "sales_invoice") return null;

  if (doc.sales_invoice_id) {
    await supabase
      .from("sales_invoices")
      .update({ journal_entry_id: journalEntryId, status: "posted", posted_at: new Date().toISOString() })
      .eq("id", doc.sales_invoice_id);
    return doc.sales_invoice_id as string;
  }

  if (!doc.ai_upload_id) return null;
  const { data: up } = await supabase
    .from("ai_uploads")
    .select("parsed")
    .eq("id", doc.ai_upload_id)
    .maybeSingle();
  const ein = up?.parsed?._einvoice ?? null;
  if (!ein) return null;

  const buyer = ein.buyer ?? {};
  const totals = ein.totals ?? {};
  const rawLines: any[] = Array.isArray(ein.lines) ? ein.lines : [];

  const invoiceNo: string | null = ein.invoice_no ?? null;
  const series: string | null = ein.series ?? null;
  const issueDate: string = ein.issue_date ?? entryDate;
  const subtotal = Number(totals.subtotal ?? up?.parsed?.subtotal ?? 0);
  const vat = Number(totals.vat_amount ?? 0);
  const total = Number(totals.total ?? up?.parsed?.total ?? subtotal + vat);

  if (invoiceNo) {
    const { data: existing } = await supabase
      .from("sales_invoices")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("invoice_no", invoiceNo)
      .eq("customer_tax_id", buyer.tax_id ?? "")
      .maybeSingle();
    if (existing?.id) {
      await supabase
        .from("sales_invoices")
        .update({ journal_entry_id: journalEntryId, status: "posted", posted_at: new Date().toISOString() })
        .eq("id", existing.id);
      await supabase.from("documents").update({ sales_invoice_id: existing.id }).eq("id", documentId);
      return existing.id as string;
    }
  }

  let customerId: string | null = null;
  if (buyer.tax_id) {
    const { data: cust } = await supabase
      .from("customers")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("tax_id", buyer.tax_id)
      .maybeSingle();
    if (cust?.id) {
      customerId = cust.id;
    } else {
      const { data: created } = await supabase
        .from("customers")
        .insert({
          tenant_id: tenantId,
          user_id: userId,
          name: buyer.name ?? "Khách hàng",
          tax_id: buyer.tax_id,
          email: buyer.email || null,
          phone: buyer.phone || null,
          address: buyer.address || null,
        })
        .select("id")
        .single();
      customerId = created?.id ?? null;
    }
  }

  const { data: inv, error: invErr } = await supabase
    .from("sales_invoices")
    .insert({
      user_id: userId,
      tenant_id: tenantId,
      customer_id: customerId,
      customer_name: buyer.name ?? null,
      customer_tax_id: buyer.tax_id ?? null,
      customer_email: buyer.email || null,
      billing_address: buyer.address || null,
      invoice_series: series,
      invoice_no: invoiceNo,
      issue_date: issueDate,
      currency: ein.currency ?? "VND",
      fx_rate: 1,
      subtotal,
      vat_amount: vat,
      total,
      discount_percent: 0,
      discount_amount: 0,
      shipping_fee: 0,
      other_fees: 0,
      payment_status: "unpaid",
      paid_amount: 0,
      status: "posted",
      send_status: "not_sent",
      posted_at: new Date().toISOString(),
      journal_entry_id: journalEntryId,
      einvoice_code: ein.cqt_code ?? null,
      notes: `Tự tạo từ XML HĐĐT (${doc.original_filename ?? ""}).`,
    })
    .select("id")
    .single();
  if (invErr || !inv) {
    console.error("[materializeSalesInvoice] insert failed", invErr);
    return null;
  }

  if (rawLines.length > 0) {
    const lineRows = rawLines.map((l: any) => {
      const qty = Number(l.qty ?? 1);
      const unitPrice = Number(l.unit_price ?? 0);
      const amount = Number(l.amount ?? qty * unitPrice);
      const vatRate = Number(l.vat_rate ?? 0);
      const lineVat = Number(l.vat_amount ?? (amount * vatRate) / 100);
      return {
        invoice_id: inv.id,
        description: l.description ?? "",
        qty,
        unit_price: unitPrice,
        amount,
        vat_rate: vatRate,
        line_discount_percent: 0,
        line_discount_amount: 0,
        pre_vat_amount: amount,
        line_vat_amount: lineVat,
      };
    });
    const { error: lErr } = await supabase.from("sales_invoice_lines").insert(lineRows);
    if (lErr) console.error("[materializeSalesInvoice] lines insert failed", lErr);
  }

  await supabase.from("documents").update({ sales_invoice_id: inv.id }).eq("id", documentId);
  return inv.id as string;
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
    const [docsRes, txnsRes, insightsRes, banksRes, postedRes, salesRes] = await Promise.all([
      supabase
        .from("documents")
        .select("id, original_filename, doc_kind, ocr_status, ocr_extracted, source, created_at, invoice_id")
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
      supabase
        .from("sales_invoices")
        .select(
          "id, customer_id, customer_name, customer_tax_id, invoice_no, issue_date, subtotal, vat_amount, total, payment_status, notes, created_at, status, journal_entry_id, tenant_id",
        )
        .eq("tenant_id", tenantId)
        .is("journal_entry_id", null)
        .in("status", ["reviewed", "issued", "sent"])
        .order("issue_date", { ascending: false })
        .limit(40),
    ]);

    const bankMap = new Map(
      ((banksRes.data ?? []) as any[]).map((a) => [
        a.id,
        `${a.bank_name ?? a.name}${a.account_no ? " ··" + String(a.account_no).slice(-4) : ""}`,
      ]),
    );

    // BATCH: prefetch proposals cho mọi document có invoice_id
    const invoiceIds = Array.from(
      new Set(
        ((docsRes.data ?? []) as any[])
          .map((d) => d.invoice_id)
          .filter((x): x is string => !!x),
      ),
    );
    const salesIds = ((salesRes.data ?? []) as any[]).map((s) => s.id);
    const [{ proposeJournalBatch }, { proposeSalesJournalBatch }] = await Promise.all([
      import("@/lib/categorize/engine.server"),
      import("@/lib/categorize/sales-engine.server"),
    ]);
    const [proposalMap, salesProposalMap] = await Promise.all([
      proposeJournalBatch(supabase, invoiceIds),
      proposeSalesJournalBatch(supabase, salesIds),
    ]);

    const items: InboxItem[] = [];
    for (const d of (docsRes.data ?? []) as any[]) {
      const prebuilt = d.invoice_id ? proposalMap.get(d.invoice_id) : undefined;
      const it = await buildDocumentItem(supabase, tenantId, d, rules, prebuilt);
      if (it) items.push(it);
    }
    for (const s of (salesRes.data ?? []) as any[]) {
      const it = await buildSalesInvoiceItem(supabase, tenantId, s, salesProposalMap.get(s.id));
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
      try {
        await materializeSalesInvoiceFromDocument(supabase, {
          documentId: data.external_id,
          tenantId,
          userId,
          entryDate: data.entry_date,
          journalEntryId: entry.id,
        });
      } catch (e: any) {
        console.warn("[approveInboxItem] materializeSalesInvoice failed:", e?.message);
      }
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

    try {
      const { invalidateCategorizeCache } = await import("@/lib/categorize/cache.server");
      invalidateCategorizeCache(tenantId);
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
