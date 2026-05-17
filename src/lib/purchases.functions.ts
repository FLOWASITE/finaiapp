import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ============ SUPPLIERS ============
const SupplierSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(255),
  tax_id: z.string().max(20).optional().nullable(),
  email: z.string().email().max(255).optional().nullable(),
  phone: z.string().max(50).optional().nullable(),
  address: z.string().max(500).optional().nullable(),
  payment_terms_days: z.number().int().min(0).max(365).default(30),
});

export const listSuppliers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("suppliers")
      .select("id, name, tax_id, email, phone, address, payment_terms_days, created_at")
      .order("name");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const upsertSupplier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => SupplierSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const payload = { ...data, user_id: userId };
    if (data.id) {
      const { error } = await supabase.from("suppliers").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await supabase
      .from("suppliers")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row!.id };
  });

export const deleteSupplier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string }) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("suppliers").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getSupplierDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string }) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: supplier, error } = await supabase
      .from("suppliers")
      .select("*")
      .eq("id", data.id)
      .single();
    if (error || !supplier) throw new Error("Không tìm thấy nhà cung cấp");

    const { data: invoices } = await supabase
      .from("invoices")
      .select("id, invoice_no, issue_date, total, payment_status, status")
      .eq("supplier_id", data.id)
      .order("issue_date", { ascending: false })
      .limit(50);

    const { data: payments } = await supabase
      .from("supplier_payments")
      .select("id, pay_date, amount, method, reference, invoice_id")
      .eq("supplier_id", data.id)
      .order("pay_date", { ascending: false })
      .limit(50);

    const totalInv = (invoices ?? []).reduce((s, i) => s + Number(i.total || 0), 0);
    const totalPaid = (payments ?? []).reduce((s, p) => s + Number(p.amount || 0), 0);

    return {
      supplier,
      invoices: invoices ?? [],
      payments: payments ?? [],
      summary: { totalInv, totalPaid, balance: totalInv - totalPaid },
    };
  });

// ============ MANUAL INVOICE ============
const ManualLineSchema = z.object({
  description: z.string().min(1).max(500),
  qty: z.number().min(0).default(1),
  unit_price: z.number().min(0).default(0),
  amount: z.number().min(0),
  vat_rate: z.number().min(0).max(100).default(0),
  product_id: z.string().uuid().optional().nullable(),
  line_type: z.enum(["goods", "service", "asset"]).default("goods"),
});

const ManualInvoiceSchema = z.object({
  supplier_id: z.string().uuid().optional().nullable(),
  supplier_name: z.string().max(255).optional().nullable(),
  supplier_tax_id: z.string().max(20).optional().nullable(),
  invoice_no: z.string().max(50).optional().nullable(),
  issue_date: z.string(),
  expense_account: z.string().max(20).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
  lines: z.array(ManualLineSchema).min(1).max(50),
});

export const createManualInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => ManualInvoiceSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const subtotal = data.lines.reduce((s, l) => s + Number(l.amount || 0), 0);
    const vat_amount = data.lines.reduce(
      (s, l) => s + Number(l.amount || 0) * (Number(l.vat_rate || 0) / 100),
      0,
    );
    const total = subtotal + vat_amount;

    const { data: inv, error } = await supabase
      .from("invoices")
      .insert({
        user_id: userId,
        file_path: `manual/${Date.now()}`,
        supplier_id: data.supplier_id,
        supplier_name: data.supplier_name,
        supplier_tax_id: data.supplier_tax_id,
        invoice_no: data.invoice_no,
        issue_date: data.issue_date,
        subtotal,
        vat_amount,
        total,
        expense_account: data.expense_account,
        notes: data.notes,
        status: "extracted",
      })
      .select("id")
      .single();
    if (error || !inv) throw new Error(error?.message || "Không tạo được hoá đơn");

    const { error: lErr } = await supabase.from("invoice_lines").insert(
      data.lines.map((l) => ({
        invoice_id: inv.id,
        description: l.description,
        qty: l.qty,
        unit_price: l.unit_price,
        amount: l.amount,
        vat_rate: l.vat_rate,
        product_id: l.product_id ?? null,
        line_type: l.line_type,
      })),
    );
    if (lErr) throw new Error(lErr.message);

    return { id: inv.id };
  });

// ============ INVOICE LIST (with filter) ============
const ListSchema = z.object({
  supplierId: z.string().uuid().optional(),
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
  status: z.string().optional(),
  paymentStatus: z.string().optional(),
  search: z.string().max(100).optional(),
});

export const listPurchaseInvoices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => ListSchema.parse(i ?? {}))
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("invoices")
      .select(
        "id, supplier_name, supplier_id, invoice_no, issue_date, subtotal, vat_amount, total, status, payment_status",
      )
      .order("issue_date", { ascending: false, nullsFirst: false })
      .limit(200);

    if (data.supplierId) q = q.eq("supplier_id", data.supplierId);
    if (data.fromDate) q = q.gte("issue_date", data.fromDate);
    if (data.toDate) q = q.lte("issue_date", data.toDate);
    if (data.status) q = q.eq("status", data.status);
    if (data.paymentStatus) q = q.eq("payment_status", data.paymentStatus);
    if (data.search) q = q.ilike("invoice_no", `%${data.search}%`);

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    // Tổng tiền đã trả theo từng invoice
    const ids = (rows ?? []).map((r) => r.id);
    let paidMap: Record<string, number> = {};
    if (ids.length > 0) {
      const { data: pays } = await context.supabase
        .from("supplier_payments")
        .select("invoice_id, amount")
        .in("invoice_id", ids);
      for (const p of pays ?? []) {
        if (p.invoice_id) {
          paidMap[p.invoice_id] = (paidMap[p.invoice_id] ?? 0) + Number(p.amount || 0);
        }
      }
    }

    const result = (rows ?? []).map((r) => ({
      ...r,
      paid: paidMap[r.id] ?? 0,
      remaining: Number(r.total || 0) - (paidMap[r.id] ?? 0),
    }));
    const totals = result.reduce(
      (acc, r) => {
        acc.subtotal += Number(r.subtotal || 0);
        acc.vat += Number(r.vat_amount || 0);
        acc.total += Number(r.total || 0);
        acc.paid += r.paid;
        acc.remaining += r.remaining;
        return acc;
      },
      { subtotal: 0, vat: 0, total: 0, paid: 0, remaining: 0 },
    );
    return { rows: result, totals };
  });

// ============ VAT INPUT REPORT ============
export const getInputVatReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { year: number; month: number }) =>
    z.object({ year: z.number().int().min(2000).max(2100), month: z.number().int().min(1).max(12) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const from = `${data.year}-${String(data.month).padStart(2, "0")}-01`;
    const toDate = new Date(data.year, data.month, 0); // last day
    const to = `${data.year}-${String(data.month).padStart(2, "0")}-${String(toDate.getDate()).padStart(2, "0")}`;

    const { data: invoices, error } = await context.supabase
      .from("invoices")
      .select("id, invoice_no, issue_date, supplier_name, supplier_tax_id, subtotal, vat_amount, total")
      .gte("issue_date", from)
      .lte("issue_date", to)
      .in("status", ["approved", "extracted", "reviewed"])
      .order("issue_date");
    if (error) throw new Error(error.message);

    const totals = (invoices ?? []).reduce(
      (a, r) => {
        a.subtotal += Number(r.subtotal || 0);
        a.vat += Number(r.vat_amount || 0);
        a.total += Number(r.total || 0);
        return a;
      },
      { subtotal: 0, vat: 0, total: 0 },
    );

    return { period: { year: data.year, month: data.month, from, to }, rows: invoices ?? [], totals };
  });
