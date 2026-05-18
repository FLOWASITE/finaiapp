import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ReceiptSchema = z.object({
  invoice_id: z.string().uuid(),
  pay_date: z.string(),
  method: z.enum(["cash", "bank", "card", "other"]).default("bank"),
  amount: z.number().positive(),
  reference: z.string().max(255).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
  branch_id: z.string().uuid().nullable().optional(),
  project_id: z.string().uuid().nullable().optional(),
  cost_center_id: z.string().uuid().nullable().optional(),
});

export const listReceipts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { invoice_id?: string; from?: string; to?: string; method?: string; customer_id?: string }) => i)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    let q = supabase
      .from("customer_receipts")
      .select("*, sales_invoices(invoice_no, total, paid_amount, payment_status, due_date)")
      .order("pay_date", { ascending: false })
      .limit(500);
    if (data.invoice_id) q = q.eq("invoice_id", data.invoice_id);
    if (data.customer_id) q = q.eq("customer_id", data.customer_id);
    if (data.method && data.method !== "all") q = q.eq("method", data.method);
    if (data.from) q = q.gte("pay_date", data.from);
    if (data.to) q = q.lte("pay_date", data.to);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows;
  });

export const listOutstandingInvoices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("sales_invoices")
      .select("id, invoice_no, customer_id, customer_name, issue_date, due_date, total, paid_amount, payment_status, currency")
      .eq("status", "issued")
      .in("payment_status", ["unpaid", "partial", "overdue"])
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return data;
  });

export const receiptsStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { from?: string; to?: string }) => i)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    let q = supabase.from("customer_receipts").select("amount, method, pay_date");
    if (data.from) q = q.gte("pay_date", data.from);
    if (data.to) q = q.lte("pay_date", data.to);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const total = (rows ?? []).reduce((s, r) => s + Number(r.amount || 0), 0);
    const cash = (rows ?? []).filter((r) => r.method === "cash").reduce((s, r) => s + Number(r.amount || 0), 0);
    const bank = (rows ?? []).filter((r) => r.method === "bank").reduce((s, r) => s + Number(r.amount || 0), 0);
    const other = total - cash - bank;
    const { data: outRows } = await supabase
      .from("sales_invoices")
      .select("total, paid_amount")
      .eq("status", "issued")
      .in("payment_status", ["unpaid", "partial", "overdue"]);
    const outstanding = (outRows ?? []).reduce(
      (s, r) => s + (Number(r.total || 0) - Number(r.paid_amount || 0)),
      0,
    );
    return { total, cash, bank, other, count: (rows ?? []).length, outstanding };
  });

export const recordReceipt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => ReceiptSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: inv } = await supabase
      .from("sales_invoices")
      .select("id, customer_id, customer_name, total, paid_amount, status")
      .eq("id", data.invoice_id)
      .single();
    if (!inv) throw new Error("Không tìm thấy hóa đơn");
    if (inv.status !== "issued") throw new Error("Hóa đơn chưa phát hành — không thu được tiền");
    const remaining = Number(inv.total) - Number(inv.paid_amount);
    if (data.amount > remaining + 0.01) throw new Error(`Số tiền vượt công nợ còn lại (${remaining.toLocaleString("vi-VN")})`);

    // Journal: Nợ 111/112, Có 131
    const debit = data.method === "cash" ? "111" : "112";
    const { data: entry, error: eErr } = await supabase
      .from("journal_entries")
      .insert({
        user_id: userId,
        entry_date: data.pay_date,
        description: `Thu tiền HĐ — ${inv.customer_name ?? ""}`,
      })
      .select("id")
      .single();
    if (eErr || !entry) throw new Error(eErr?.message || "Không tạo bút toán");
    await supabase.from("journal_lines").insert([
      { entry_id: entry.id, account_code: debit, debit: data.amount, credit: 0, line_order: 0 },
      { entry_id: entry.id, account_code: "131", debit: 0, credit: data.amount, line_order: 1 },
    ]);

    const { error } = await supabase.from("customer_receipts").insert({
      user_id: userId,
      invoice_id: data.invoice_id,
      customer_id: inv.customer_id,
      customer_name: inv.customer_name,
      pay_date: data.pay_date,
      method: data.method,
      amount: data.amount,
      reference: data.reference || null,
      notes: data.notes || null,
      journal_entry_id: entry.id,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteReceipt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string }) => i)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: r } = await supabase
      .from("customer_receipts")
      .select("id, journal_entry_id, amount, pay_date, customer_name")
      .eq("id", data.id)
      .single();
    if (!r) throw new Error("Không tìm thấy phiếu thu");
    if (r.journal_entry_id) {
      const { data: orig } = await supabase
        .from("journal_lines")
        .select("account_code, debit, credit")
        .eq("entry_id", r.journal_entry_id);
      const { data: re } = await supabase
        .from("journal_entries")
        .insert({
          user_id: userId,
          entry_date: new Date().toISOString().slice(0, 10),
          description: `Hủy phiếu thu — ${r.customer_name ?? ""}`,
        })
        .select("id")
        .single();
      if (re && orig) {
        await supabase.from("journal_lines").insert(
          orig.map((l, i) => ({
            entry_id: re.id,
            account_code: l.account_code,
            debit: Number(l.credit),
            credit: Number(l.debit),
            line_order: i,
          })),
        );
      }
    }
    await supabase.from("customer_receipts").delete().eq("id", data.id);
    return { ok: true };
  });
