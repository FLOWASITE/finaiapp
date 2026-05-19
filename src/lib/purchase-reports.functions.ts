import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const RangeSchema = z.object({
  from: z.string().min(10).max(10),
  to: z.string().min(10).max(10),
});

const ACTIVE_STATUSES = ["reviewed", "posted"];

async function fetchInvoicesAndLines(supabase: any, from: string, to: string) {
  const { data: invs = [] } = await supabase
    .from("invoices")
    .select("id, invoice_no, issue_date, supplier_id, supplier_name, status, total, vat_amount, subtotal")
    .gte("issue_date", from)
    .lte("issue_date", to)
    .in("status", ACTIVE_STATUSES)
    .order("issue_date", { ascending: true });
  const ids = (invs ?? []).map((i: any) => i.id);
  if (ids.length === 0) return { invoices: invs ?? [], lines: [] };
  const { data: lines = [] } = await supabase
    .from("invoice_lines")
    .select("id, invoice_id, product_id, description, qty, unit_price, amount, vat_rate")
    .in("invoice_id", ids);
  return { invoices: invs ?? [], lines: lines ?? [] };
}

async function fetchProductMap(supabase: any, productIds: (string | null)[]) {
  const ids = Array.from(new Set(productIds.filter(Boolean))) as string[];
  if (ids.length === 0) return new Map<string, any>();
  const { data = [] } = await supabase.from("products").select("id, code, name, unit").in("id", ids);
  const m = new Map<string, any>();
  for (const p of data ?? []) m.set(p.id, { code: p.code ?? "", name: p.name ?? "", unit: p.unit ?? "" });
  return m;
}

async function fetchSupplierMap(supabase: any, ids: (string | null)[]) {
  const uniq = Array.from(new Set(ids.filter(Boolean))) as string[];
  if (uniq.length === 0) return new Map<string, any>();
  const { data = [] } = await supabase.from("suppliers").select("id, code, name").in("id", uniq);
  const m = new Map<string, any>();
  for (const s of data ?? []) m.set(s.id, { code: s.code ?? "", name: s.name ?? "" });
  return m;
}

// 1) Sổ chi tiết mua hàng
export const purchaseDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => RangeSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { invoices, lines } = await fetchInvoicesAndLines(supabase, data.from, data.to);
    const invMap = new Map(invoices.map((i: any) => [i.id, i] as const));
    const productMap = await fetchProductMap(supabase, lines.map((l: any) => l.product_id));
    const supplierMap = await fetchSupplierMap(supabase, invoices.map((i: any) => i.supplier_id));

    const rows = lines.map((l: any) => {
      const inv: any = invMap.get(l.invoice_id);
      const p = l.product_id ? productMap.get(l.product_id) : null;
      const s = inv?.supplier_id ? supplierMap.get(inv.supplier_id) : null;
      const amount = Number(l.amount || 0);
      const vatRate = Number(l.vat_rate || 0);
      const vat = (amount * vatRate) / 100;
      return {
        invoice_id: l.invoice_id,
        invoice_no: inv?.invoice_no ?? "",
        issue_date: inv?.issue_date ?? "",
        supplier_code: s?.code ?? "",
        supplier_name: s?.name ?? inv?.supplier_name ?? "",
        product_code: p?.code ?? "",
        product_name: p?.name ?? l.description ?? "",
        unit: p?.unit ?? "",
        qty: Number(l.qty || 0),
        unit_price: Number(l.unit_price || 0),
        pre_vat: amount,
        vat,
        total: amount + vat,
      };
    });
    rows.sort((a: any, b: any) => a.issue_date.localeCompare(b.issue_date) || a.invoice_no.localeCompare(b.invoice_no));
    const totals = rows.reduce(
      (s: any, r: any) => ({ qty: s.qty + r.qty, pre_vat: s.pre_vat + r.pre_vat, vat: s.vat + r.vat, total: s.total + r.total }),
      { qty: 0, pre_vat: 0, vat: 0, total: 0 },
    );
    return { rows, totals };
  });

// 2) Tổng hợp mua theo mặt hàng
export const purchaseByItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => RangeSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { invoices, lines } = await fetchInvoicesAndLines(supabase, data.from, data.to);
    const invMap = new Map(invoices.map((i: any) => [i.id, i] as const));
    const productMap = await fetchProductMap(supabase, lines.map((l: any) => l.product_id));
    const supplierMap = await fetchSupplierMap(supabase, invoices.map((i: any) => i.supplier_id));

    const byProduct = new Map<string, any>();
    for (const l of lines as any[]) {
      const inv: any = invMap.get(l.invoice_id);
      const p = l.product_id ? productMap.get(l.product_id) : null;
      const s = inv?.supplier_id ? supplierMap.get(inv.supplier_id) : null;
      const key = l.product_id ?? `__d:${l.description}`;
      const amount = Number(l.amount || 0);
      const vat = (amount * Number(l.vat_rate || 0)) / 100;
      const cur = byProduct.get(key) ?? {
        product_id: l.product_id,
        product_code: p?.code ?? "",
        product_name: p?.name ?? l.description ?? "",
        unit: p?.unit ?? "",
        qty: 0,
        pre_vat: 0,
        vat: 0,
        total: 0,
        suppliers: new Set<string>(),
      };
      cur.qty += Number(l.qty || 0);
      cur.pre_vat += amount;
      cur.vat += vat;
      cur.total += amount + vat;
      if (s?.name) cur.suppliers.add(s.name);
      else if (inv?.supplier_name) cur.suppliers.add(inv.supplier_name);
      byProduct.set(key, cur);
    }
    const rows = Array.from(byProduct.values())
      .map((r) => ({ ...r, suppliers: Array.from(r.suppliers as Set<string>).join(", ") }))
      .sort((a, b) => b.total - a.total);
    const totals = rows.reduce(
      (s, r) => ({ qty: s.qty + r.qty, pre_vat: s.pre_vat + r.pre_vat, vat: s.vat + r.vat, total: s.total + r.total }),
      { qty: 0, pre_vat: 0, vat: 0, total: 0 },
    );
    return { rows, totals };
  });
