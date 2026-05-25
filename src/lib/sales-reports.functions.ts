import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const RangeSchema = z.object({
  from: z.string().min(10).max(10),
  to: z.string().min(10).max(10),
});

const ACTIVE_STATUSES = ["reviewed", "posted"];

type InvoiceRow = {
  id: string;
  invoice_no: string | null;
  issue_date: string;
  customer_id: string | null;
  customer_name: string | null;
  sales_order_id: string | null;
  status: string;
  total: number;
  paid_amount: number;
  vat_amount: number;
  subtotal: number;
};

type LineRow = {
  id: string;
  invoice_id: string;
  product_id: string | null;
  description: string;
  qty: number;
  unit_price: number;
  pre_vat_amount: number;
  line_vat_amount: number;
  line_discount_amount: number;
  amount: number;
  vat_rate: number;
};

async function fetchInvoicesAndLines(
  supabase: any,
  tenantId: string,
  from: string,
  to: string,
) {
  const { data: invs = [] } = await supabase
    .from("sales_invoices")
    .select(
      "id, invoice_no, issue_date, customer_id, customer_name, sales_order_id, status, total, paid_amount, vat_amount, subtotal",
    )
    .eq("tenant_id", tenantId)
    .gte("issue_date", from)
    .lte("issue_date", to)
    .in("status", ACTIVE_STATUSES)
    .order("issue_date", { ascending: true });

  const invIds = (invs ?? []).map((i: any) => i.id);
  if (invIds.length === 0) {
    return { invoices: (invs ?? []) as InvoiceRow[], lines: [] as LineRow[] };
  }

  const { data: lines = [] } = await supabase
    .from("sales_invoice_lines")
    .select(
      "id, invoice_id, product_id, description, qty, unit_price, pre_vat_amount, line_vat_amount, line_discount_amount, amount, vat_rate",
    )
    .in("invoice_id", invIds);

  return {
    invoices: (invs ?? []) as InvoiceRow[],
    lines: (lines ?? []) as LineRow[],
  };
}

async function fetchProductMap(supabase: any, productIds: string[]) {
  const ids = Array.from(new Set(productIds.filter(Boolean)));
  if (ids.length === 0) return new Map<string, { code: string; name: string; unit: string; unit_cost: number }>();
  const { data = [] } = await supabase
    .from("products")
    .select("id, code, name, unit, unit_cost")
    .in("id", ids);
  const m = new Map<string, any>();
  for (const p of data ?? []) {
    m.set(p.id, { code: p.code ?? "", name: p.name ?? "", unit: p.unit ?? "", unit_cost: Number(p.unit_cost || 0) });
  }
  return m;
}

async function fetchCustomerMap(supabase: any, ids: (string | null)[]) {
  const uniq = Array.from(new Set(ids.filter(Boolean))) as string[];
  if (uniq.length === 0) return new Map<string, { code: string; name: string }>();
  const { data = [] } = await supabase
    .from("customers")
    .select("id, code, name")
    .in("id", uniq);
  const m = new Map<string, any>();
  for (const c of data ?? []) m.set(c.id, { code: c.code ?? "", name: c.name ?? "" });
  return m;
}

async function fetchSalespersonMap(supabase: any, soIds: (string | null)[]) {
  const uniq = Array.from(new Set(soIds.filter(Boolean))) as string[];
  if (uniq.length === 0)
    return { byInvoiceSO: new Map<string, string | null>(), employees: new Map<string, { code: string; name: string }>() };
  const { data: orders = [] } = await supabase
    .from("sales_orders")
    .select("id, salesperson_id")
    .in("id", uniq);
  const soToEmp = new Map<string, string | null>();
  const empIds = new Set<string>();
  for (const o of orders ?? []) {
    soToEmp.set(o.id, o.salesperson_id ?? null);
    if (o.salesperson_id) empIds.add(o.salesperson_id);
  }
  const empMap = new Map<string, { code: string; name: string }>();
  if (empIds.size > 0) {
    const { data: emps = [] } = await supabase
      .from("employees")
      .select("id, code, full_name")
      .in("id", Array.from(empIds));
    for (const e of emps ?? []) empMap.set(e.id, { code: e.code ?? "", name: e.full_name ?? "" });
  }
  return { byInvoiceSO: soToEmp, employees: empMap };
}

// ============================================================
// 1) Sổ chi tiết bán hàng — one row per line
// ============================================================
export const salesDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => RangeSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { invoices, lines } = await fetchInvoicesAndLines(supabase, data.from, data.to);
    const invMap = new Map(invoices.map((i) => [i.id, i] as const));
    const productMap = await fetchProductMap(supabase, lines.map((l) => l.product_id || ""));
    const customerMap = await fetchCustomerMap(supabase, invoices.map((i) => i.customer_id));

    const rows = lines.map((l) => {
      const inv = invMap.get(l.invoice_id);
      const p = l.product_id ? productMap.get(l.product_id) : null;
      const c = inv?.customer_id ? customerMap.get(inv.customer_id) : null;
      return {
        invoice_id: l.invoice_id,
        invoice_no: inv?.invoice_no ?? "",
        issue_date: inv?.issue_date ?? "",
        customer_code: c?.code ?? "",
        customer_name: c?.name ?? inv?.customer_name ?? "",
        product_code: p?.code ?? "",
        product_name: p?.name ?? l.description,
        unit: p?.unit ?? "",
        qty: Number(l.qty),
        unit_price: Number(l.unit_price),
        discount: Number(l.line_discount_amount),
        pre_vat: Number(l.pre_vat_amount),
        vat: Number(l.line_vat_amount),
        total: Number(l.amount),
      };
    });
    // Sort by date then invoice_no
    rows.sort((a, b) => a.issue_date.localeCompare(b.issue_date) || a.invoice_no.localeCompare(b.invoice_no));
    const totals = rows.reduce(
      (s, r) => ({
        qty: s.qty + r.qty,
        pre_vat: s.pre_vat + r.pre_vat,
        vat: s.vat + r.vat,
        total: s.total + r.total,
      }),
      { qty: 0, pre_vat: 0, vat: 0, total: 0 },
    );
    return { rows, totals };
  });

// ============================================================
// 2) Lãi/lỗ theo mặt hàng
// ============================================================
export const salesProfitByItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => RangeSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { lines } = await fetchInvoicesAndLines(supabase, data.from, data.to);
    const productMap = await fetchProductMap(supabase, lines.map((l) => l.product_id || ""));

    const byProduct = new Map<string, any>();
    for (const l of lines) {
      const key = l.product_id ?? `__d:${l.description}`;
      const p = l.product_id ? productMap.get(l.product_id) : null;
      const cost = (p?.unit_cost ?? 0) * Number(l.qty);
      const revenue = Number(l.pre_vat_amount);
      const cur = byProduct.get(key) ?? {
        product_id: l.product_id,
        product_code: p?.code ?? "",
        product_name: p?.name ?? l.description,
        unit: p?.unit ?? "",
        qty: 0,
        revenue: 0,
        cost: 0,
      };
      cur.qty += Number(l.qty);
      cur.revenue += revenue;
      cur.cost += cost;
      byProduct.set(key, cur);
    }
    const rows = Array.from(byProduct.values()).map((r) => ({
      ...r,
      profit: r.revenue - r.cost,
      margin_pct: r.revenue > 0 ? ((r.revenue - r.cost) / r.revenue) * 100 : 0,
    }));
    rows.sort((a, b) => b.profit - a.profit);
    const totals = rows.reduce(
      (s, r) => ({ qty: s.qty + r.qty, revenue: s.revenue + r.revenue, cost: s.cost + r.cost, profit: s.profit + r.profit }),
      { qty: 0, revenue: 0, cost: 0, profit: 0 },
    );
    return { rows, totals };
  });

// ============================================================
// 3) Số lượng bán theo sản phẩm
// ============================================================
export const salesQtyByItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => RangeSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { lines } = await fetchInvoicesAndLines(supabase, data.from, data.to);
    const productMap = await fetchProductMap(supabase, lines.map((l) => l.product_id || ""));

    const byProduct = new Map<string, any>();
    for (const l of lines) {
      const key = l.product_id ?? `__d:${l.description}`;
      const p = l.product_id ? productMap.get(l.product_id) : null;
      const cur = byProduct.get(key) ?? {
        product_id: l.product_id,
        product_code: p?.code ?? "",
        product_name: p?.name ?? l.description,
        unit: p?.unit ?? "",
        qty: 0,
        pre_vat: 0,
        vat: 0,
        total: 0,
      };
      cur.qty += Number(l.qty);
      cur.pre_vat += Number(l.pre_vat_amount);
      cur.vat += Number(l.line_vat_amount);
      cur.total += Number(l.amount);
      byProduct.set(key, cur);
    }
    const rows = Array.from(byProduct.values()).sort((a, b) => b.qty - a.qty);
    const totals = rows.reduce(
      (s, r) => ({ qty: s.qty + r.qty, pre_vat: s.pre_vat + r.pre_vat, vat: s.vat + r.vat, total: s.total + r.total }),
      { qty: 0, pre_vat: 0, vat: 0, total: 0 },
    );
    return { rows, totals };
  });

// ============================================================
// 4) Theo khách hàng
// ============================================================
export const salesByCustomer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => RangeSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { invoices } = await fetchInvoicesAndLines(supabase, data.from, data.to);
    const customerMap = await fetchCustomerMap(supabase, invoices.map((i) => i.customer_id));

    const byCust = new Map<string, any>();
    for (const inv of invoices) {
      const key = inv.customer_id ?? `__n:${inv.customer_name ?? ""}`;
      const c = inv.customer_id ? customerMap.get(inv.customer_id) : null;
      const cur = byCust.get(key) ?? {
        customer_id: inv.customer_id,
        customer_code: c?.code ?? "",
        customer_name: c?.name ?? inv.customer_name ?? "(Không có)",
        invoices: 0,
        pre_vat: 0,
        vat: 0,
        total: 0,
        paid: 0,
        remaining: 0,
      };
      cur.invoices += 1;
      cur.pre_vat += Number(inv.subtotal);
      cur.vat += Number(inv.vat_amount);
      cur.total += Number(inv.total);
      cur.paid += Number(inv.paid_amount);
      cur.remaining += Number(inv.total) - Number(inv.paid_amount);
      byCust.set(key, cur);
    }
    const rows = Array.from(byCust.values()).sort((a, b) => b.total - a.total);
    const totals = rows.reduce(
      (s, r) => ({
        invoices: s.invoices + r.invoices,
        pre_vat: s.pre_vat + r.pre_vat,
        vat: s.vat + r.vat,
        total: s.total + r.total,
        paid: s.paid + r.paid,
        remaining: s.remaining + r.remaining,
      }),
      { invoices: 0, pre_vat: 0, vat: 0, total: 0, paid: 0, remaining: 0 },
    );
    return { rows, totals };
  });

// ============================================================
// 5) Theo nhân viên (salesperson)
// ============================================================
export const salesBySalesperson = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => RangeSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { invoices } = await fetchInvoicesAndLines(supabase, data.from, data.to);
    const { byInvoiceSO, employees } = await fetchSalespersonMap(
      supabase,
      invoices.map((i) => i.sales_order_id),
    );

    const byEmp = new Map<string, any>();
    for (const inv of invoices) {
      const empId = inv.sales_order_id ? byInvoiceSO.get(inv.sales_order_id) ?? null : null;
      const key = empId ?? "__none";
      const e = empId ? employees.get(empId) : null;
      const cur = byEmp.get(key) ?? {
        employee_id: empId,
        employee_code: e?.code ?? "",
        employee_name: e?.name ?? "(Không xác định)",
        invoices: 0,
        pre_vat: 0,
        vat: 0,
        total: 0,
      };
      cur.invoices += 1;
      cur.pre_vat += Number(inv.subtotal);
      cur.vat += Number(inv.vat_amount);
      cur.total += Number(inv.total);
      byEmp.set(key, cur);
    }
    const rows = Array.from(byEmp.values()).sort((a, b) => b.total - a.total);
    const totals = rows.reduce(
      (s, r) => ({
        invoices: s.invoices + r.invoices,
        pre_vat: s.pre_vat + r.pre_vat,
        vat: s.vat + r.vat,
        total: s.total + r.total,
      }),
      { invoices: 0, pre_vat: 0, vat: 0, total: 0 },
    );
    return { rows, totals };
  });

// ============================================================
// 6) Theo khách hàng & sản phẩm
// ============================================================
export const salesByCustomerItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => RangeSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { invoices, lines } = await fetchInvoicesAndLines(supabase, data.from, data.to);
    const invMap = new Map(invoices.map((i) => [i.id, i] as const));
    const productMap = await fetchProductMap(supabase, lines.map((l) => l.product_id || ""));
    const customerMap = await fetchCustomerMap(supabase, invoices.map((i) => i.customer_id));

    const map = new Map<string, any>();
    for (const l of lines) {
      const inv = invMap.get(l.invoice_id);
      if (!inv) continue;
      const custKey = inv.customer_id ?? `__n:${inv.customer_name ?? ""}`;
      const prodKey = l.product_id ?? `__d:${l.description}`;
      const key = custKey + "|" + prodKey;
      const c = inv.customer_id ? customerMap.get(inv.customer_id) : null;
      const p = l.product_id ? productMap.get(l.product_id) : null;
      const cur = map.get(key) ?? {
        customer_code: c?.code ?? "",
        customer_name: c?.name ?? inv.customer_name ?? "(Không có)",
        product_code: p?.code ?? "",
        product_name: p?.name ?? l.description,
        unit: p?.unit ?? "",
        qty: 0,
        pre_vat: 0,
        total: 0,
      };
      cur.qty += Number(l.qty);
      cur.pre_vat += Number(l.pre_vat_amount);
      cur.total += Number(l.amount);
      map.set(key, cur);
    }
    const rows = Array.from(map.values()).sort(
      (a, b) => a.customer_name.localeCompare(b.customer_name) || b.total - a.total,
    );
    const totals = rows.reduce(
      (s, r) => ({ qty: s.qty + r.qty, pre_vat: s.pre_vat + r.pre_vat, total: s.total + r.total }),
      { qty: 0, pre_vat: 0, total: 0 },
    );
    return { rows, totals };
  });

// ============================================================
// 7) Theo nhân viên & sản phẩm
// ============================================================
export const salesBySalespersonItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => RangeSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { invoices, lines } = await fetchInvoicesAndLines(supabase, data.from, data.to);
    const invMap = new Map(invoices.map((i) => [i.id, i] as const));
    const productMap = await fetchProductMap(supabase, lines.map((l) => l.product_id || ""));
    const { byInvoiceSO, employees } = await fetchSalespersonMap(
      supabase,
      invoices.map((i) => i.sales_order_id),
    );

    const map = new Map<string, any>();
    for (const l of lines) {
      const inv = invMap.get(l.invoice_id);
      if (!inv) continue;
      const empId = inv.sales_order_id ? byInvoiceSO.get(inv.sales_order_id) ?? null : null;
      const empKey = empId ?? "__none";
      const prodKey = l.product_id ?? `__d:${l.description}`;
      const key = empKey + "|" + prodKey;
      const e = empId ? employees.get(empId) : null;
      const p = l.product_id ? productMap.get(l.product_id) : null;
      const cur = map.get(key) ?? {
        employee_code: e?.code ?? "",
        employee_name: e?.name ?? "(Không xác định)",
        product_code: p?.code ?? "",
        product_name: p?.name ?? l.description,
        unit: p?.unit ?? "",
        qty: 0,
        pre_vat: 0,
        total: 0,
      };
      cur.qty += Number(l.qty);
      cur.pre_vat += Number(l.pre_vat_amount);
      cur.total += Number(l.amount);
      map.set(key, cur);
    }
    const rows = Array.from(map.values()).sort(
      (a, b) => a.employee_name.localeCompare(b.employee_name) || b.total - a.total,
    );
    const totals = rows.reduce(
      (s, r) => ({ qty: s.qty + r.qty, pre_vat: s.pre_vat + r.pre_vat, total: s.total + r.total }),
      { qty: 0, pre_vat: 0, total: 0 },
    );
    return { rows, totals };
  });
