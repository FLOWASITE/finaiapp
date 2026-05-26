import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertTenantMember } from "@/lib/auth/active-tenant.server";
import { withTenant } from "@/integrations/supabase/with-tenant";

const LineSchema = z.object({
  id: z.string().uuid().optional(),
  line_no: z.number().int().min(1).default(1),
  product_id: z.string().uuid().nullable().optional(),
  description: z.string().min(1).max(500),
  unit: z.string().max(32).nullable().optional(),
  qty_ordered: z.number().min(0).default(0),
  unit_price: z.number().min(0).default(0),
  discount_percent: z.number().min(0).max(100).default(0),
  discount_amount: z.number().min(0).default(0),
  vat_rate: z.number().min(0).max(100).default(0),
  warehouse_id: z.string().uuid().nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});

const OrderSchema = z.object({
  id: z.string().uuid().optional(),
  order_no: z.string().max(50).optional().nullable(),
  order_date: z.string(),
  expected_delivery_date: z.string().nullable().optional(),
  valid_until: z.string().nullable().optional(),
  customer_id: z.string().uuid().nullable().optional(),
  customer_name: z.string().max(255).nullable().optional(),
  customer_tax_id: z.string().max(50).nullable().optional(),
  ship_address: z.string().max(500).nullable().optional(),
  billing_address: z.string().max(500).nullable().optional(),
  currency: z.string().length(3).default("VND"),
  fx_rate: z.number().positive().default(1),
  payment_terms_days: z.number().int().min(0).max(365).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
  internal_notes: z.string().max(1000).nullable().optional(),
  branch_id: z.string().uuid().nullable().optional(),
  department_id: z.string().uuid().nullable().optional(),
  project_id: z.string().uuid().nullable().optional(),
  cost_center_id: z.string().uuid().nullable().optional(),
  salesperson_id: z.string().uuid().nullable().optional(),
  status: z.enum(["draft", "confirmed"]).default("draft"),
  deposit_enabled: z.boolean().default(false),
  reserve_enabled: z.boolean().default(false),
  deposit_required: z.number().min(0).default(0),
  deposit_percent: z.number().min(0).max(100).nullable().optional(),
  deposit_due_date: z.string().nullable().optional(),
  lines: z.array(LineSchema).min(1).max(200),
});

function computeLine(l: z.infer<typeof LineSchema>) {
  const gross = l.qty_ordered * l.unit_price;
  const discPct = gross * (l.discount_percent / 100);
  const disc = Math.min(gross, discPct + l.discount_amount);
  const preVat = Math.max(0, gross - disc);
  const vat = preVat * (l.vat_rate / 100);
  return {
    discount_amount: disc,
    pre_vat_amount: preVat,
    vat_amount: vat,
    amount: preVat + vat,
  };
}

function yyyymm(d: Date) {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
}

async function nextOrderNo(supabase: any, tenantId: string | null, userId: string, date: string) {
  const prefix = `DH${yyyymm(new Date(date))}/`;
  let q = supabase.from("sales_orders").select("order_no").like("order_no", `${prefix}%`);
  if (tenantId) q = q.eq("tenant_id", tenantId);
  else q = q.eq("user_id", userId);
  const { data: rows } = await q;
  let max = 0;
  for (const r of (rows as any[]) ?? []) {
    const m = /\/(\d+)$/.exec(r.order_no ?? "");
    if (m) {
      const n = parseInt(m[1], 10);
      if (!isNaN(n) && n > max) max = n;
    }
  }
  return `${prefix}${String(max + 1).padStart(5, "0")}`;
}

const ListSchema = z.object({
  customerId: z.string().uuid().optional(),
  status: z.string().optional(),
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
  search: z.string().max(100).optional(),
});

export const listSalesOrders = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i: unknown) => ListSchema.parse(i ?? {}))
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("sales_orders")
      .select("*, customers(name, code), sales_order_lines(qty_ordered, qty_delivered)")
      .eq("tenant_id", context.tenantId)
      .order("order_date", { ascending: false })
      .limit(500);
    if (data.customerId) q = q.eq("customer_id", data.customerId);
    if (data.status) q = q.eq("status", data.status);
    if (data.fromDate) q = q.gte("order_date", data.fromDate);
    if (data.toDate) q = q.lte("order_date", data.toDate);
    if (data.search) q = q.or(`order_no.ilike.%${data.search}%,customer_name.ilike.%${data.search}%`);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const result = (rows ?? []).map((r: any) => {
      const qord = (r.sales_order_lines ?? []).reduce((s: number, l: any) => s + Number(l.qty_ordered || 0), 0);
      const qdel = (r.sales_order_lines ?? []).reduce((s: number, l: any) => s + Number(l.qty_delivered || 0), 0);
      const progress = qord > 0 ? Math.min(100, (qdel / qord) * 100) : 0;
      return { ...r, qty_ordered_sum: qord, qty_delivered_sum: qdel, progress };
    });
    const totals = result.reduce(
      (a: any, r: any) => {
        a.count += 1;
        a.total += Number(r.total || 0);
        return a;
      },
      { count: 0, total: 0 },
    );
    return { rows: result, totals };
  });

export const getSalesOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string }) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: order, error } = await context.supabase
      .from("sales_orders")
      .select("*, sales_order_lines(*), customers(name, code, email, phone)")
      .eq("id", data.id)
      .single();
    if (error) throw new Error(error.message);
    const { data: invoices } = await context.supabase
      .from("sales_invoices")
      .select("id, invoice_no, issue_date, total, status, payment_status")
      .eq("sales_order_id", data.id)
      .order("issue_date", { ascending: false });
    const lines = ((order as any).sales_order_lines ?? []).sort(
      (a: any, b: any) => (a.line_no ?? 0) - (b.line_no ?? 0),
    );
    return { ...(order as any), sales_order_lines: lines, invoices: invoices ?? [] };
  });

export const upsertSalesOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => OrderSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("active_tenant_id")
      .eq("id", userId)
      .maybeSingle();
    const tenantId = profile?.active_tenant_id ?? null;
    if (tenantId) await assertTenantMember(supabase, userId, tenantId);

    const enriched = data.lines.map((l, idx) => {
      const c = computeLine(l);
      return { ...l, line_no: l.line_no || idx + 1, ...c };
    });
    const subtotal = enriched.reduce((s, l) => s + l.pre_vat_amount, 0);
    const vat_amount = enriched.reduce((s, l) => s + l.vat_amount, 0);
    const discount_amount = enriched.reduce((s, l) => s + l.discount_amount, 0);
    const total = subtotal + vat_amount;

    const orderNo = data.order_no || (await nextOrderNo(supabase, tenantId, userId, data.order_date));

    const headerPayload: any = {
      user_id: userId,
      tenant_id: tenantId,
      order_no: orderNo,
      order_date: data.order_date,
      expected_delivery_date: data.expected_delivery_date || null,
      valid_until: data.valid_until || null,
      customer_id: data.customer_id || null,
      customer_name: data.customer_name || null,
      customer_tax_id: data.customer_tax_id || null,
      ship_address: data.ship_address || null,
      billing_address: data.billing_address || null,
      currency: data.currency,
      fx_rate: data.fx_rate,
      payment_terms_days: data.payment_terms_days ?? null,
      notes: data.notes || null,
      internal_notes: data.internal_notes || null,
      branch_id: data.branch_id || null,
      department_id: data.department_id || null,
      project_id: data.project_id || null,
      cost_center_id: data.cost_center_id || null,
      salesperson_id: data.salesperson_id || null,
      subtotal,
      discount_amount,
      vat_amount,
      total,
      status: data.status,
      deposit_enabled: data.deposit_enabled,
      reserve_enabled: data.reserve_enabled,
      deposit_required: data.deposit_required ?? 0,
      deposit_percent: data.deposit_percent ?? null,
      deposit_due_date: data.deposit_due_date || null,
      confirmed_at: data.status === "confirmed" ? new Date().toISOString() : null,
      confirmed_by: data.status === "confirmed" ? userId : null,
    };

    let orderId = data.id;
    if (orderId) {
      const { error } = await supabase.from("sales_orders").update(headerPayload).eq("id", orderId);
      if (error) throw new Error(error.message);
      await supabase.from("sales_order_lines").delete().eq("order_id", orderId);
    } else {
      const { data: row, error } = await supabase.from("sales_orders").insert(headerPayload).select("id").single();
      if (error) throw new Error(error.message);
      orderId = row!.id;
    }

    const linesPayload = enriched.map((l) => ({
      order_id: orderId,
      line_no: l.line_no,
      product_id: l.product_id || null,
      description: l.description,
      unit: l.unit || null,
      qty_ordered: l.qty_ordered,
      unit_price: l.unit_price,
      discount_percent: l.discount_percent,
      discount_amount: l.discount_amount,
      vat_rate: l.vat_rate,
      vat_amount: l.vat_amount,
      pre_vat_amount: l.pre_vat_amount,
      amount: l.amount,
      warehouse_id: l.warehouse_id || null,
      notes: l.notes || null,
    }));
    const { error: lErr } = await supabase.from("sales_order_lines").insert(linesPayload);
    if (lErr) throw new Error(lErr.message);

    return { id: orderId };
  });

export const confirmSalesOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string; allowPartialReserve?: boolean }) =>
    z.object({ id: z.string().uuid(), allowPartialReserve: z.boolean().optional() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: order, error: oErr } = await supabase
      .from("sales_orders")
      .select("*, sales_order_lines(*)")
      .eq("id", data.id).single();
    if (oErr) throw new Error(oErr.message);
    const o = order as any;
    if (o.status !== "draft") throw new Error("Chỉ duyệt được đơn đang ở trạng thái nháp");

    // Reserve stock (logic only, no movements)
    const shortages: { description: string; need: number; available: number }[] = [];
    if (o.reserve_enabled) {
      const lines = (o.sales_order_lines ?? []).filter((l: any) => l.product_id && l.warehouse_id && Number(l.qty_ordered) > 0);
      for (const l of lines) {
        const { data: oh } = await supabase.rpc("fn_product_on_hand", { p_product: l.product_id, p_warehouse: l.warehouse_id });
        const { data: rv } = await supabase.rpc("fn_product_reserved_qty", { p_product: l.product_id, p_warehouse: l.warehouse_id });
        const avail = Number(oh ?? 0) - Number(rv ?? 0);
        const need = Number(l.qty_ordered);
        if (avail + 1e-6 < need) {
          shortages.push({ description: l.description, need, available: Math.max(0, avail) });
        }
      }
      if (shortages.length > 0 && !data.allowPartialReserve) {
        const msg = shortages.map((s) => `• ${s.description}: cần ${s.need}, khả dụng ${s.available}`).join("\n");
        throw new Error(`Không đủ tồn kho để giữ:\n${msg}`);
      }
      // Create reservations
      const payload = lines.map((l: any) => {
        const need = Number(l.qty_ordered);
        return {
          tenant_id: o.tenant_id,
          user_id: userId,
          product_id: l.product_id,
          warehouse_id: l.warehouse_id,
          ref_type: "sales_order",
          ref_id: l.id,
          qty_reserved: need, // reserve full want; shortage = backorder tracked separately
          expires_at: o.valid_until || null,
        };
      });
      if (payload.length > 0) {
        const { error: rErr } = await supabase
          .from("stock_reservations")
          .upsert(payload, { onConflict: "ref_type,ref_id" });
        if (rErr) throw new Error(rErr.message);
      }
    }

    const { error } = await supabase
      .from("sales_orders")
      .update({ status: "confirmed", confirmed_at: new Date().toISOString(), confirmed_by: userId })
      .eq("id", data.id).eq("status", "draft");
    if (error) throw new Error(error.message);
    return { ok: true, shortages };
  });

export const cancelSalesOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string; reason?: string }) =>
    z.object({ id: z.string().uuid(), reason: z.string().max(500).optional() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { count } = await supabase
      .from("sales_invoices")
      .select("id", { count: "exact", head: true })
      .eq("sales_order_id", data.id)
      .neq("status", "void");
    if ((count ?? 0) > 0) throw new Error("Đơn đã có hoá đơn liên kết, không thể huỷ");
    const { error } = await supabase
      .from("sales_orders")
      .update({ status: "cancelled", cancel_reason: data.reason || null, closed_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    // Release active reservations
    const { data: lns } = await supabase.from("sales_order_lines").select("id").eq("order_id", data.id);
    const ids = (lns ?? []).map((l: any) => l.id);
    if (ids.length > 0) {
      await supabase.from("stock_reservations")
        .update({ status: "cancelled", released_at: new Date().toISOString() })
        .in("ref_id", ids).eq("ref_type", "sales_order").eq("status", "active");
    }
    return { ok: true };
  });

export const closeSalesOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string }) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("sales_orders")
      .update({ status: "closed", closed_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteSalesOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string }) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { count } = await supabase
      .from("sales_invoices")
      .select("id", { count: "exact", head: true })
      .eq("sales_order_id", data.id);
    if ((count ?? 0) > 0) throw new Error("Đơn đã có hoá đơn liên kết, không thể xoá");
    const { error } = await supabase.from("sales_orders").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const salesOrderStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { fromDate?: string; toDate?: string }) =>
    z.object({ fromDate: z.string().optional(), toDate: z.string().optional() }).parse(i ?? {}),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("sales_orders")
      .select("total, status")
      .neq("status", "cancelled");
    if (data.fromDate) q = q.gte("order_date", data.fromDate);
    if (data.toDate) q = q.lte("order_date", data.toDate);
    const { data: rows } = await q;
    const totals = (rows ?? []).reduce(
      (a: any, r: any) => {
        a.count += 1;
        a.value += Number(r.total || 0);
        if (r.status === "fulfilled") a.fulfilled += 1;
        if (r.status === "partial") a.partial += 1;
        if (r.status === "draft") a.draft += 1;
        if (r.status === "confirmed") a.confirmed += 1;
        return a;
      },
      { count: 0, value: 0, fulfilled: 0, partial: 0, draft: 0, confirmed: 0 },
    );
    return totals;
  });
