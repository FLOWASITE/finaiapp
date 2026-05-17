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
});

export const listReceipts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { invoice_id?: string }) => i)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    let q = supabase
      .from("customer_receipts")
      .select("*")
      .order("pay_date", { ascending: false })
      .limit(200);
    if (data.invoice_id) q = q.eq("invoice_id", data.invoice_id);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows;
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
