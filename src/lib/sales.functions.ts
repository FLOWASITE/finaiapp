import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { calcLineTax, vatHasOutputTax, vatRate, type VatCode } from "@/lib/vat-codes";

const VAT_CODES = ["0", "5", "8", "10", "KCT", "KKKNT"] as const;

const LineSchema = z.object({
  product_id: z.string().uuid().optional().nullable(),
  description: z.string().min(1).max(500),
  qty: z.number().positive(),
  unit_price: z.number().min(0),
  vat_code: z.enum(VAT_CODES).default("10"),
  line_discount_percent: z.number().min(0).max(100).default(0),
  line_discount_amount: z.number().min(0).default(0),
});

const InvoiceSchema = z.object({
  id: z.string().uuid().optional(),
  customer_id: z.string().uuid().optional().nullable(),
  customer_name: z.string().max(255).optional(),
  customer_tax_id: z.string().max(50).optional().nullable(),
  customer_email: z.string().email().optional().nullable().or(z.literal("")),
  billing_address: z.string().max(500).optional().nullable(),
  shipping_address: z.string().max(500).optional().nullable(),
  issue_date: z.string(),
  due_date: z.string().optional().nullable(),
  payment_terms_days: z.number().int().min(0).max(365).optional().nullable(),
  currency: z.string().length(3).default("VND"),
  fx_rate: z.number().positive().default(1),
  discount_percent: z.number().min(0).max(100).default(0),
  discount_amount: z.number().min(0).default(0),
  shipping_fee: z.number().min(0).default(0),
  other_fees: z.number().min(0).default(0),
  notes: z.string().max(1000).optional().nullable(),
  lines: z.array(LineSchema).min(1),
});

function computeTotals(data: z.infer<typeof InvoiceSchema>) {
  let preVatSum = 0;
  let vatSum = 0;
  const enriched = data.lines.map((l) => {
    const t = calcLineTax({
      qty: l.qty,
      unit_price: l.unit_price,
      line_discount_percent: l.line_discount_percent,
      line_discount_amount: l.line_discount_amount,
      vat_code: l.vat_code as VatCode,
    });
    preVatSum += t.pre_vat_amount;
    vatSum += t.line_vat_amount;
    return { ...l, ...t, amount: t.line_total, vat_rate: vatRate(l.vat_code as VatCode) };
  });
  // Apply header discount on subtotal (pre-VAT)
  const headerDiscount = Math.min(
    preVatSum,
    preVatSum * (data.discount_percent / 100) + data.discount_amount,
  );
  const subtotal = Math.max(0, preVatSum - headerDiscount);
  // Recalc VAT proportional to the new subtotal
  const vatScale = preVatSum > 0 ? subtotal / preVatSum : 0;
  const vat = vatSum * vatScale;
  const total = subtotal + vat + data.shipping_fee + data.other_fees;
  return { lines: enriched, subtotal, vat, total };
}

export const listSalesInvoices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("sales_invoices")
      .select("*, customers(name, code)")
      .order("issue_date", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return data;
  });

export const salesDashboardStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const today = new Date().toISOString().slice(0, 10);
    const first = today.slice(0, 8) + "01";
    const { data: month } = await supabase
      .from("sales_invoices")
      .select("total, status, payment_status, paid_amount, due_date")
      .gte("issue_date", first)
      .neq("status", "void");
    const issued = (month ?? []).filter((r) => r.status === "issued");
    const revenue = issued.reduce((s, r) => s + Number(r.total || 0), 0);
    const outstanding = issued.reduce(
      (s, r) => s + (Number(r.total || 0) - Number(r.paid_amount || 0)),
      0,
    );
    const { data: overdueRows } = await supabase
      .from("sales_invoices")
      .select("total, paid_amount")
      .lt("due_date", today)
      .in("payment_status", ["unpaid", "partial", "overdue"])
      .neq("status", "void");
    const overdue = (overdueRows ?? []).reduce(
      (s, r) => s + (Number(r.total || 0) - Number(r.paid_amount || 0)),
      0,
    );
    return {
      revenue_month: revenue,
      invoices_month: issued.length,
      outstanding,
      overdue,
    };
  });

export const getSalesInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string }) => i)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: inv, error } = await supabase
      .from("sales_invoices")
      .select("*, sales_invoice_lines(*), customers(name, code, email, contact_person), customer_receipts(*)")
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
    const { lines, subtotal, vat, total } = computeTotals(data);

    // Default due_date from payment_terms_days
    let due_date = data.due_date || null;
    if (!due_date && data.payment_terms_days != null) {
      const d = new Date(data.issue_date);
      d.setDate(d.getDate() + data.payment_terms_days);
      due_date = d.toISOString().slice(0, 10);
    }

    // Pull customer snapshot if customer_id present
    let snap = {
      customer_name: data.customer_name || null,
      customer_tax_id: data.customer_tax_id || null,
      customer_email: data.customer_email || null,
    };
    if (data.customer_id) {
      const { data: c } = await supabase
        .from("customers")
        .select("name, tax_id, email")
        .eq("id", data.customer_id)
        .single();
      if (c) {
        snap = {
          customer_name: snap.customer_name || c.name,
          customer_tax_id: snap.customer_tax_id || c.tax_id,
          customer_email: snap.customer_email || c.email,
        };
      }
    }

    const payload = {
      user_id: userId,
      customer_id: data.customer_id || null,
      ...snap,
      billing_address: data.billing_address || null,
      shipping_address: data.shipping_address || null,
      issue_date: data.issue_date,
      due_date,
      payment_terms_days: data.payment_terms_days ?? null,
      currency: data.currency,
      fx_rate: data.fx_rate,
      discount_percent: data.discount_percent,
      discount_amount: data.discount_amount,
      shipping_fee: data.shipping_fee,
      other_fees: data.other_fees,
      notes: data.notes || null,
      subtotal,
      vat_amount: vat,
      total,
      updated_at: new Date().toISOString(),
    };

    let invoiceId = data.id;
    if (invoiceId) {
      const { error } = await supabase.from("sales_invoices").update(payload).eq("id", invoiceId);
      if (error) throw new Error(error.message);
      await supabase.from("sales_invoice_lines").delete().eq("invoice_id", invoiceId);
    } else {
      const { data: row, error } = await supabase
        .from("sales_invoices")
        .insert(payload)
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      invoiceId = row!.id;
    }
    const { error: lErr } = await supabase.from("sales_invoice_lines").insert(
      lines.map((l) => ({
        invoice_id: invoiceId!,
        product_id: l.product_id || null,
        description: l.description,
        qty: l.qty,
        unit_price: l.unit_price,
        vat_code: l.vat_code,
        vat_rate: l.vat_rate,
        line_discount_percent: l.line_discount_percent,
        line_discount_amount: l.line_discount_amount,
        pre_vat_amount: l.pre_vat_amount,
        line_vat_amount: l.line_vat_amount,
        amount: l.amount,
      })),
    );
    if (lErr) throw new Error(lErr.message);
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
    if (inv.status === "void") throw new Error("Hóa đơn đã hủy");

    // Mock e-invoice issuance — generate code + QR placeholder
    const seq = Math.floor(Math.random() * 9_000_000) + 1_000_000;
    const einvoiceNo = String(seq);
    const einvoiceCode = `${inv.invoice_series ?? "1C25TAA"}-${einvoiceNo}`;
    const einvoiceQr = `https://tracuuhoadon.gdt.gov.vn/?code=${einvoiceCode}`;

    // Journal: Nợ 131 (total) / Có 511 (subtotal), Có 33311 (vat if taxable codes only)
    const desc = `Bán hàng HĐ ${einvoiceCode}${inv.customer_name ? ` — ${inv.customer_name}` : ""}`;
    const { data: entry, error: eErr } = await supabase
      .from("journal_entries")
      .insert({ user_id: userId, entry_date: inv.issue_date, description: desc })
      .select("id")
      .single();
    if (eErr || !entry) throw new Error(eErr?.message || "Không tạo bút toán");

    const jLines: Array<{ entry_id: string; account_code: string; debit: number; credit: number; line_order: number }> = [
      { entry_id: entry.id, account_code: "131", debit: Number(inv.total), credit: 0, line_order: 0 },
      { entry_id: entry.id, account_code: "511", debit: 0, credit: Number(inv.subtotal), line_order: 1 },
    ];
    // Shipping/other fees → 5113 (or 711). Group into 511 for now via the subtotal? Keep separate to 711.
    if (Number(inv.shipping_fee || 0) + Number(inv.other_fees || 0) > 0) {
      jLines.push({
        entry_id: entry.id,
        account_code: "711",
        debit: 0,
        credit: Number(inv.shipping_fee || 0) + Number(inv.other_fees || 0),
        line_order: jLines.length,
      });
      // Adjust 511 to not double count
      jLines[1].credit = Number(inv.subtotal);
      // 131 already includes everything. We need balanced. Re-sum:
    }
    // VAT only if any taxable line present
    const taxableVat = (inv.sales_invoice_lines ?? []).reduce(
      (s: number, l: any) => (vatHasOutputTax(l.vat_code as VatCode) ? s + Number(l.line_vat_amount || 0) : s),
      0,
    );
    if (taxableVat > 0) {
      jLines.push({ entry_id: entry.id, account_code: "33311", debit: 0, credit: taxableVat, line_order: jLines.length });
    }

    // COGS per line if product_id present
    for (const l of inv.sales_invoice_lines ?? []) {
      if (!l.product_id) continue;
      const { data: p } = await supabase
        .from("products")
        .select("unit_cost, on_hand, cogs_account, stock_account")
        .eq("id", l.product_id)
        .single();
      if (!p) continue;
      const cogs = Number(l.qty) * Number(p.unit_cost);
      if (cogs > 0) {
        jLines.push(
          { entry_id: entry.id, account_code: p.cogs_account, debit: cogs, credit: 0, line_order: jLines.length },
          { entry_id: entry.id, account_code: p.stock_account, debit: 0, credit: cogs, line_order: jLines.length + 1 },
        );
      }
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

    await supabase.from("journal_lines").insert(jLines);
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

    return { ok: true, einvoice_code: einvoiceCode, qr: einvoiceQr };
  });

export const voidSalesInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string; reason?: string }) => i)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: inv } = await supabase
      .from("sales_invoices")
      .select("id, status, journal_entry_id, notes, sales_invoice_lines(product_id, qty)")
      .eq("id", data.id)
      .single();
    if (!inv) throw new Error("Không tìm thấy hóa đơn");
    if (inv.status === "void") throw new Error("Hóa đơn đã hủy");

    // Reverse journal if any
    if (inv.journal_entry_id) {
      const { data: orig } = await supabase
        .from("journal_lines")
        .select("account_code, debit, credit")
        .eq("entry_id", inv.journal_entry_id);
      const { data: re } = await supabase
        .from("journal_entries")
        .insert({
          user_id: userId,
          entry_date: new Date().toISOString().slice(0, 10),
          description: `Hủy HĐ ${data.id.slice(0, 8)} — ${data.reason ?? ""}`,
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
      // Restock products
      for (const l of inv.sales_invoice_lines ?? []) {
        if (!l.product_id) continue;
        const { data: p } = await supabase.from("products").select("on_hand, unit_cost").eq("id", l.product_id).single();
        if (!p) continue;
        await supabase.from("products").update({ on_hand: Number(p.on_hand) + Number(l.qty) }).eq("id", l.product_id);
        await supabase.from("stock_movements").insert({
          user_id: userId,
          product_id: l.product_id,
          movement_type: "in",
          qty: l.qty,
          unit_cost: p.unit_cost,
          ref_type: "sales_invoice_void",
          ref_id: data.id,
          movement_date: new Date().toISOString().slice(0, 10),
        });
      }
    }

    await supabase
      .from("sales_invoices")
      .update({
        status: "void",
        payment_status: "void",
        notes: (inv.notes ? inv.notes + "\n" : "") + `[VOID] ${data.reason ?? ""}`,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.id);

    return { ok: true };
  });
