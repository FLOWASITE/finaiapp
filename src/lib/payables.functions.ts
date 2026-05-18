import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ============ AGING LIST (existing) ============
export const listPayables = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data: invoices } = await supabase
      .from("invoices")
      .select("id, supplier_id, supplier_name, invoice_no, issue_date, total, status")
      .order("issue_date", { ascending: false });
    const { data: payments } = await supabase
      .from("supplier_payments")
      .select("invoice_id, amount");

    const paidByInv = new Map<string, number>();
    (payments ?? []).forEach((p) => {
      if (!p.invoice_id) return;
      paidByInv.set(p.invoice_id, (paidByInv.get(p.invoice_id) ?? 0) + Number(p.amount));
    });

    const today = new Date();
    const rows = (invoices ?? []).map((i) => {
      const paid = paidByInv.get(i.id) ?? 0;
      const remaining = Number(i.total ?? 0) - paid;
      const days = i.issue_date
        ? Math.floor((today.getTime() - new Date(i.issue_date).getTime()) / 86400000)
        : 0;
      let bucket: "0-30" | "31-60" | "61-90" | ">90" = "0-30";
      if (days > 90) bucket = ">90";
      else if (days > 60) bucket = "61-90";
      else if (days > 30) bucket = "31-60";
      return { ...i, paid, remaining, days, bucket };
    });
    return rows;
  });

// ============ RECORD PAYMENT (with journal posting) ============
const PaymentSchema = z.object({
  invoice_id: z.string().uuid().optional(),
  supplier_id: z.string().uuid().optional(),
  supplier_name: z.string().max(255).optional(),
  amount: z.number().positive(),
  pay_date: z.string(),
  method: z.enum(["cash", "bank"]).default("bank"),
  reference: z.string().max(255).optional(),
});

export const recordPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => PaymentSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Resolve supplier name from invoice if needed
    let supplierId = data.supplier_id ?? null;
    let supplierName = data.supplier_name ?? null;
    if (data.invoice_id) {
      const { data: inv } = await supabase
        .from("invoices")
        .select("supplier_id, supplier_name, total")
        .eq("id", data.invoice_id)
        .single();
      if (inv) {
        supplierId = supplierId ?? inv.supplier_id ?? null;
        supplierName = supplierName ?? inv.supplier_name ?? null;
      }
    }

    // Journal: Nợ 331 / Có 111|112
    const credit = data.method === "cash" ? "111" : "112";
    const { data: entry, error: eErr } = await supabase
      .from("journal_entries")
      .insert({
        user_id: userId,
        entry_date: data.pay_date,
        description: `Chi trả NCC — ${supplierName ?? ""}`,
      })
      .select("id")
      .single();
    if (eErr || !entry) throw new Error(eErr?.message || "Không tạo bút toán");

    await supabase.from("journal_lines").insert([
      { entry_id: entry.id, account_code: "331", debit: data.amount, credit: 0, line_order: 0 },
      { entry_id: entry.id, account_code: credit, debit: 0, credit: data.amount, line_order: 1 },
    ]);

    const { error } = await supabase.from("supplier_payments").insert({
      user_id: userId,
      invoice_id: data.invoice_id ?? null,
      supplier_id: supplierId,
      supplier_name: supplierName,
      pay_date: data.pay_date,
      method: data.method,
      amount: data.amount,
      reference: data.reference || null,
      journal_entry_id: entry.id,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============ DELETE PAYMENT (reverse journal) ============
export const deleteSupplierPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string }) =>
    z.object({ id: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: p } = await supabase
      .from("supplier_payments")
      .select("id, journal_entry_id, supplier_name")
      .eq("id", data.id)
      .single();
    if (!p) throw new Error("Không tìm thấy phiếu chi");
    if (p.journal_entry_id) {
      const { data: orig } = await supabase
        .from("journal_lines")
        .select("account_code, debit, credit")
        .eq("entry_id", p.journal_entry_id);
      const { data: re } = await supabase
        .from("journal_entries")
        .insert({
          user_id: userId,
          entry_date: new Date().toISOString().slice(0, 10),
          description: `Hủy phiếu chi — ${p.supplier_name ?? ""}`,
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
    await supabase.from("supplier_payments").delete().eq("id", data.id);
    return { ok: true };
  });

// ============ LIST SUPPLIER PAYMENTS (filterable) ============
const ListPaymentsSchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  method: z.string().optional(),
});

export const listSupplierPayments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => ListPaymentsSchema.parse(i ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    let q = supabase
      .from("supplier_payments")
      .select(
        "id, pay_date, supplier_id, supplier_name, invoice_id, amount, method, reference, invoices(invoice_no, payment_status)",
      )
      .order("pay_date", { ascending: false })
      .limit(500);
    if (data.from) q = q.gte("pay_date", data.from);
    if (data.to) q = q.lte("pay_date", data.to);
    if (data.method && data.method !== "all") q = q.eq("method", data.method);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const payablesStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { from?: string; to?: string }) =>
    z.object({ from: z.string().optional(), to: z.string().optional() }).parse(i ?? {}),
  )
  .handler(withLatency("payablesStats", async ({ data, context }) => {
    const { supabase } = context;
    let q = supabase.from("supplier_payments").select("amount, method");
    if (data.from) q = q.gte("pay_date", data.from);
    if (data.to) q = q.lte("pay_date", data.to);
    const { data: rows } = await q;
    const total = (rows ?? []).reduce((s, r) => s + Number(r.amount || 0), 0);
    const cash = (rows ?? []).filter((r) => r.method === "cash").reduce((s, r) => s + Number(r.amount || 0), 0);
    const bank = (rows ?? []).filter((r) => r.method === "bank").reduce((s, r) => s + Number(r.amount || 0), 0);

    // Outstanding = sum of (invoice.total - sum payments)
    const { data: invs } = await supabase
      .from("invoices")
      .select("id, total");
    const { data: pays } = await supabase
      .from("supplier_payments")
      .select("invoice_id, amount");
    const paidMap = new Map<string, number>();
    for (const p of pays ?? []) {
      if (p.invoice_id)
        paidMap.set(p.invoice_id, (paidMap.get(p.invoice_id) ?? 0) + Number(p.amount || 0));
    }
    let outstanding = 0;
    for (const i of invs ?? []) {
      outstanding += Math.max(0, Number(i.total || 0) - (paidMap.get(i.id) ?? 0));
    }

    return { total, cash, bank, outstanding, count: (rows ?? []).length };
  }));


export const listOutstandingPurchaseInvoices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data: invs } = await supabase
      .from("invoices")
      .select("id, invoice_no, supplier_id, supplier_name, issue_date, total")
      .order("issue_date", { ascending: false })
      .limit(500);
    const { data: pays } = await supabase
      .from("supplier_payments")
      .select("invoice_id, amount");
    const paidMap = new Map<string, number>();
    for (const p of pays ?? []) {
      if (p.invoice_id)
        paidMap.set(p.invoice_id, (paidMap.get(p.invoice_id) ?? 0) + Number(p.amount || 0));
    }
    return (invs ?? [])
      .map((i) => ({
        ...i,
        paid_amount: paidMap.get(i.id) ?? 0,
        remaining: Number(i.total || 0) - (paidMap.get(i.id) ?? 0),
      }))
      .filter((i) => i.remaining > 0.5);
  });
