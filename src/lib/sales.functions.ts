import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const LineSchema = z.object({
  product_id: z.string().uuid().optional(),
  description: z.string().min(1).max(500),
  qty: z.number().positive(),
  unit_price: z.number().min(0),
  vat_rate: z.number().min(0).max(100).default(10),
});

const InvoiceSchema = z.object({
  id: z.string().uuid().optional(),
  customer_name: z.string().max(255).optional(),
  customer_tax_id: z.string().max(50).optional(),
  issue_date: z.string(),
  notes: z.string().max(500).optional(),
  lines: z.array(LineSchema).min(1),
});

export const listSalesInvoices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("sales_invoices")
      .select("*")
      .order("issue_date", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return data;
  });

export const getSalesInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string }) => i)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: inv, error } = await supabase
      .from("sales_invoices")
      .select("*, sales_invoice_lines(*)")
      .eq("id", data.id)
      .single();
    if (error) throw new Error(error.message);
    return inv;
  });

export const upsertSalesInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => InvoiceSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    let subtotal = 0, vat = 0;
    const lines = data.lines.map((l) => {
      const amt = l.qty * l.unit_price;
      subtotal += amt;
      vat += amt * (l.vat_rate / 100);
      return { ...l, amount: amt };
    });
    const total = subtotal + vat;

    const payload = {
      user_id: userId,
      customer_name: data.customer_name,
      customer_tax_id: data.customer_tax_id,
      issue_date: data.issue_date,
      notes: data.notes,
      subtotal, vat_amount: vat, total,
      updated_at: new Date().toISOString(),
    };

    let invoiceId = data.id;
    if (invoiceId) {
      await supabase.from("sales_invoices").update(payload).eq("id", invoiceId);
      await supabase.from("sales_invoice_lines").delete().eq("invoice_id", invoiceId);
    } else {
      const { data: row, error } = await supabase.from("sales_invoices").insert(payload).select("id").single();
      if (error) throw new Error(error.message);
      invoiceId = row!.id;
    }
    await supabase.from("sales_invoice_lines").insert(
      lines.map((l) => ({ ...l, invoice_id: invoiceId }))
    );
    return { id: invoiceId };
  });

export const issueSalesInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string }) => i)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: inv, error } = await supabase
      .from("sales_invoices")
      .select("*, sales_invoice_lines(*)")
      .eq("id", data.id)
      .single();
    if (error || !inv) throw new Error("Không tìm thấy hóa đơn");
    if (inv.status === "issued") throw new Error("Hóa đơn đã phát hành");

    // Mock e-invoice issuance — generate code + QR placeholder
    const seq = Math.floor(Math.random() * 9_000_000) + 1_000_000;
    const einvoiceNo = String(seq);
    const einvoiceCode = `${inv.invoice_series}-${einvoiceNo}`;
    const einvoiceQr = `https://tracuuhoadon.gdt.gov.vn/?code=${einvoiceCode}`;

    // Auto journal: Nợ 131 / Có 511 (subtotal), Có 33311 (vat)
    const desc = `Bán hàng HĐ ${einvoiceCode}${inv.customer_name ? ` — ${inv.customer_name}` : ""}`;
    const { data: entry, error: eErr } = await supabase
      .from("journal_entries")
      .insert({ user_id: userId, entry_date: inv.issue_date, description: desc })
      .select("id")
      .single();
    if (eErr || !entry) throw new Error(eErr?.message || "Không tạo bút toán");

    const lines: Array<{ entry_id: string; account_code: string; debit: number; credit: number; line_order: number }> = [
      { entry_id: entry.id, account_code: "131", debit: Number(inv.total), credit: 0, line_order: 0 },
      { entry_id: entry.id, account_code: "511", debit: 0, credit: Number(inv.subtotal), line_order: 1 },
    ];
    if (Number(inv.vat_amount) > 0) {
      lines.push({ entry_id: entry.id, account_code: "33311", debit: 0, credit: Number(inv.vat_amount), line_order: 2 });
    }

    // Cost of goods sold per line if product_id present
    let cogsTotal = 0;
    for (const l of inv.sales_invoice_lines ?? []) {
      if (!l.product_id) continue;
      const { data: p } = await supabase
        .from("products")
        .select("unit_cost, on_hand, cogs_account, stock_account")
        .eq("id", l.product_id)
        .single();
      if (!p) continue;
      const cogs = Number(l.qty) * Number(p.unit_cost);
      cogsTotal += cogs;
      lines.push(
        { entry_id: entry.id, account_code: p.cogs_account, debit: cogs, credit: 0, line_order: lines.length },
        { entry_id: entry.id, account_code: p.stock_account, debit: 0, credit: cogs, line_order: lines.length + 1 },
      );
      // Stock out
      await supabase.from("stock_movements").insert({
        user_id: userId,
        product_id: l.product_id,
        movement_type: "out",
        qty: l.qty,
        unit_cost: p.unit_cost,
        ref_type: "sales_invoice",
        ref_id: inv.id,
        movement_date: inv.issue_date,
      });
      await supabase.from("products").update({ on_hand: Number(p.on_hand) - Number(l.qty) }).eq("id", l.product_id);
    }

    await supabase.from("journal_lines").insert(lines);
    await supabase
      .from("sales_invoices")
      .update({
        status: "issued",
        invoice_no: einvoiceNo,
        einvoice_code: einvoiceCode,
        einvoice_qr: einvoiceQr,
        journal_entry_id: entry.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", inv.id);

    return { ok: true, einvoice_code: einvoiceCode, qr: einvoiceQr, cogs: cogsTotal };
  });
