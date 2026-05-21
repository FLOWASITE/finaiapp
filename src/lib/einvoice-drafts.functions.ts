import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Tự sinh các dòng bút toán mặc định từ HĐĐT.
// - Chiều mua (in):
//     Nợ <expense_account|642> = subtotal
//     Nợ 1331                  = vat_amount (nếu > 0)
//     Có 331                   = total
// - Chiều bán (out):
//     Nợ 131                   = total
//     Có 5111                  = subtotal
//     Có 33311                 = vat_amount (nếu > 0)
function buildDefaultLines(e: any, expenseAccount: string | null) {
  const subtotal = Number(e.subtotal || 0);
  const vat = Number(e.vat_amount || 0);
  const total = Number(e.total || subtotal + vat);
  const lines: Array<{
    account_code: string;
    debit: number;
    credit: number;
    description?: string | null;
    line_order: number;
  }> = [];
  if (e.direction === "in") {
    const exp = (expenseAccount || "642").trim();
    lines.push({ account_code: exp, debit: subtotal, credit: 0, description: "Chi phí / hàng hoá", line_order: 1 });
    if (vat > 0)
      lines.push({ account_code: "1331", debit: vat, credit: 0, description: "Thuế GTGT được khấu trừ", line_order: 2 });
    lines.push({ account_code: "331", debit: 0, credit: total, description: "Phải trả NCC", line_order: 3 });
  } else {
    lines.push({ account_code: "131", debit: total, credit: 0, description: "Phải thu khách hàng", line_order: 1 });
    lines.push({ account_code: "5111", debit: 0, credit: subtotal, description: "Doanh thu bán hàng", line_order: 2 });
    if (vat > 0)
      lines.push({ account_code: "33311", debit: 0, credit: vat, description: "Thuế GTGT đầu ra", line_order: 3 });
  }
  return lines;
}

async function loadEinvoice(supabase: any, einvoiceId: string) {
  const { data, error } = await supabase
    .from("einvoices")
    .select(
      "id, tenant_id, direction, seller_name, buyer_name, invoice_no, issue_date, subtotal, vat_amount, total, matched_purchase_invoice_id, matched_sales_invoice_id",
    )
    .eq("id", einvoiceId)
    .maybeSingle();
  if (error || !data) throw new Error("Không tìm thấy HĐĐT");
  return data;
}

async function resolveExpenseAccount(supabase: any, e: any): Promise<string | null> {
  if (e.direction !== "in" || !e.matched_purchase_invoice_id) return null;
  const { data } = await supabase
    .from("invoices")
    .select("expense_account")
    .eq("id", e.matched_purchase_invoice_id)
    .maybeSingle();
  return data?.expense_account ?? null;
}

// ============ INTERNAL: tạo draft (idempotent) ============
export async function ensureDraftForEinvoice(
  supabase: any,
  userId: string,
  einvoiceId: string,
): Promise<string | null> {
  const { data: existing } = await supabase
    .from("einvoice_journal_drafts")
    .select("id, status")
    .eq("einvoice_id", einvoiceId)
    .neq("status", "discarded")
    .maybeSingle();
  if (existing) return existing.id;

  const e = await loadEinvoice(supabase, einvoiceId);
  const total = Number(e.total || 0);
  if (!total) return null;
  const expense = await resolveExpenseAccount(supabase, e);
  const lines = buildDefaultLines(e, expense);
  const desc =
    e.direction === "in"
      ? `HĐĐT mua ${e.invoice_no ?? ""} — ${e.seller_name ?? ""}`.trim()
      : `HĐĐT bán ${e.invoice_no ?? ""} — ${e.buyer_name ?? ""}`.trim();

  const { data: created, error } = await supabase
    .from("einvoice_journal_drafts")
    .insert({
      tenant_id: e.tenant_id,
      user_id: userId,
      einvoice_id: e.id,
      entry_date: e.issue_date,
      description: desc,
      status: "draft",
    })
    .select("id")
    .single();
  if (error || !created) return null;

  await supabase
    .from("einvoice_journal_draft_lines")
    .insert(lines.map((l) => ({ ...l, draft_id: created.id })));

  return created.id;
}

// ============ GENERATE ============
export const generateDraftFromEinvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ einvoiceId: z.string().uuid(), regenerate: z.boolean().optional() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (data.regenerate) {
      const { data: ex } = await supabase
        .from("einvoice_journal_drafts")
        .select("id, status")
        .eq("einvoice_id", data.einvoiceId)
        .neq("status", "discarded")
        .maybeSingle();
      if (ex) {
        if (ex.status === "posted") throw new Error("Bút toán đã ghi sổ, không thể tái tạo");
        await supabase.from("einvoice_journal_drafts").delete().eq("id", ex.id);
      }
    }
    const id = await ensureDraftForEinvoice(supabase, userId, data.einvoiceId);
    if (!id) throw new Error("Không tạo được nháp bút toán (HĐĐT thiếu tổng tiền?)");
    return { id };
  });

// ============ GET ============
export const getDraftForEinvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ einvoiceId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: draft } = await supabase
      .from("einvoice_journal_drafts")
      .select("*")
      .eq("einvoice_id", data.einvoiceId)
      .neq("status", "discarded")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!draft) return { draft: null, lines: [] };
    const { data: lines } = await supabase
      .from("einvoice_journal_draft_lines")
      .select("*")
      .eq("draft_id", draft.id)
      .order("line_order", { ascending: true });
    return { draft, lines: lines ?? [] };
  });

// ============ UPDATE ============
const LineInput = z.object({
  account_code: z.string().min(3).max(20),
  debit: z.number().min(0).default(0),
  credit: z.number().min(0).default(0),
  description: z.string().max(255).optional().nullable(),
});

export const updateDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        entry_date: z.string().optional(),
        description: z.string().max(500).optional().nullable(),
        lines: z.array(LineInput).min(1).max(50),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: draft } = await supabase
      .from("einvoice_journal_drafts")
      .select("id, status")
      .eq("id", data.id)
      .maybeSingle();
    if (!draft) throw new Error("Không tìm thấy nháp");
    if (draft.status !== "draft") throw new Error("Chỉ chỉnh sửa được nháp ở trạng thái draft");

    const totalDr = data.lines.reduce((s, l) => s + Number(l.debit || 0), 0);
    const totalCr = data.lines.reduce((s, l) => s + Number(l.credit || 0), 0);
    if (Math.abs(totalDr - totalCr) > 0.5)
      throw new Error(`Bút toán không cân: Nợ ${totalDr} ≠ Có ${totalCr}`);

    const patch: any = {};
    if (data.entry_date) patch.entry_date = data.entry_date;
    if (data.description !== undefined) patch.description = data.description;
    if (Object.keys(patch).length) {
      await supabase.from("einvoice_journal_drafts").update(patch).eq("id", data.id);
    }
    await supabase.from("einvoice_journal_draft_lines").delete().eq("draft_id", data.id);
    await supabase
      .from("einvoice_journal_draft_lines")
      .insert(
        data.lines.map((l, idx) => ({
          draft_id: data.id,
          account_code: l.account_code.trim(),
          debit: Number(l.debit || 0),
          credit: Number(l.credit || 0),
          description: l.description ?? null,
          line_order: idx + 1,
        })),
      );
    return { ok: true };
  });

// ============ POST (duyệt → ghi sổ) ============
export const postDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: draft } = await supabase
      .from("einvoice_journal_drafts")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (!draft) throw new Error("Không tìm thấy nháp");
    if (draft.status !== "draft") throw new Error("Nháp đã được xử lý");

    const { data: lines } = await supabase
      .from("einvoice_journal_draft_lines")
      .select("*")
      .eq("draft_id", data.id)
      .order("line_order", { ascending: true });
    if (!lines || lines.length === 0) throw new Error("Bút toán không có dòng");

    const dr = lines.reduce((s: number, l: any) => s + Number(l.debit || 0), 0);
    const cr = lines.reduce((s: number, l: any) => s + Number(l.credit || 0), 0);
    if (Math.abs(dr - cr) > 0.5) throw new Error(`Không cân: Nợ ${dr} ≠ Có ${cr}`);

    const { data: entry, error: eErr } = await supabase
      .from("journal_entries")
      .insert({
        user_id: userId,
        tenant_id: draft.tenant_id,
        entry_date: draft.entry_date,
        description: draft.description ?? "Bút toán từ HĐĐT",
      })
      .select("id")
      .single();
    if (eErr || !entry) throw new Error(eErr?.message || "Không tạo được bút toán");

    const { error: lErr } = await supabase.from("journal_lines").insert(
      lines.map((l: any, idx: number) => ({
        entry_id: entry.id,
        account_code: l.account_code,
        debit: Number(l.debit || 0),
        credit: Number(l.credit || 0),
        line_order: idx + 1,
      })),
    );
    if (lErr) throw new Error(lErr.message);

    await supabase
      .from("einvoice_journal_drafts")
      .update({ status: "posted", posted_entry_id: entry.id, posted_at: new Date().toISOString() })
      .eq("id", data.id);

    return { entryId: entry.id };
  });

// ============ DISCARD ============
export const discardDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("einvoice_journal_drafts")
      .update({ status: "discarded" })
      .eq("id", data.id)
      .eq("status", "draft");
    if (error) throw new Error(error.message);
    return { ok: true };
  });
