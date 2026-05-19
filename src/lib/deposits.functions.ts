import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function yyyymm(d: Date) {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
}

async function nextDepositNo(supabase: any, tenantId: string | null, userId: string, date: string) {
  const prefix = `DC${yyyymm(new Date(date))}/`;
  let q = supabase.from("sales_order_deposits").select("deposit_no").like("deposit_no", `${prefix}%`);
  if (tenantId) q = q.eq("tenant_id", tenantId);
  else q = q.eq("user_id", userId);
  const { data: rows } = await q;
  let max = 0;
  for (const r of (rows as any[]) ?? []) {
    const m = /\/(\d+)$/.exec(r.deposit_no ?? "");
    if (m) {
      const n = parseInt(m[1], 10);
      if (!isNaN(n) && n > max) max = n;
    }
  }
  return `${prefix}${String(max + 1).padStart(5, "0")}`;
}

const DepositSchema = z.object({
  id: z.string().uuid().optional(),
  order_id: z.string().uuid(),
  pay_date: z.string(),
  amount: z.number().positive(),
  method: z.enum(["cash", "bank"]).default("cash"),
  reference: z.string().max(200).nullable().optional(),
  cash_account: z.string().max(50).nullable().optional(),
  advance_account: z.string().max(50).default("131"),
  notes: z.string().max(1000).nullable().optional(),
});

export const listSalesOrderDeposits = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { orderId: string }) => z.object({ orderId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("sales_order_deposits")
      .select("*")
      .eq("order_id", data.orderId)
      .order("pay_date", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const upsertSalesOrderDeposit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => DepositSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles").select("active_tenant_id").eq("id", userId).maybeSingle();
    const tenantId = profile?.active_tenant_id ?? null;

    const payload: any = {
      user_id: userId,
      tenant_id: tenantId,
      order_id: data.order_id,
      pay_date: data.pay_date,
      amount: data.amount,
      method: data.method,
      reference: data.reference || null,
      cash_account: data.cash_account || null,
      advance_account: data.advance_account || "131",
      notes: data.notes || null,
    };

    if (data.id) {
      const { error } = await supabase.from("sales_order_deposits").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }

    payload.deposit_no = await nextDepositNo(supabase, tenantId, userId, data.pay_date);
    const { data: row, error } = await supabase.from("sales_order_deposits").insert(payload).select("id").single();
    if (error) throw new Error(error.message);
    return { id: row!.id };
  });

export const postSalesOrderDeposit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string }) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: dep, error } = await supabase
      .from("sales_order_deposits").select("*, sales_orders(customer_id, customer_name, order_no, branch_id, project_id, cost_center_id)")
      .eq("id", data.id).single();
    if (error) throw new Error(error.message);
    if ((dep as any).status === "posted") return { ok: true };
    if (!(dep as any).cash_account) throw new Error("Chưa chọn tài khoản tiền (111/112)");

    const order = (dep as any).sales_orders ?? {};
    const desc = `Thu cọc ĐĐH ${order.order_no ?? ""} — ${order.customer_name ?? ""}`.trim();

    const { data: je, error: jeErr } = await supabase
      .from("journal_entries")
      .insert({
        user_id: userId,
        tenant_id: (dep as any).tenant_id,
        entry_date: (dep as any).pay_date,
        description: desc,
      })
      .select("id").single();
    if (jeErr) throw new Error(jeErr.message);

    const lines = [
      { entry_id: je!.id, account_code: (dep as any).cash_account, debit: (dep as any).amount, credit: 0, line_order: 1,
        branch_id: order.branch_id || null, project_id: order.project_id || null, cost_center_id: order.cost_center_id || null },
      { entry_id: je!.id, account_code: (dep as any).advance_account || "131", debit: 0, credit: (dep as any).amount, line_order: 2,
        branch_id: order.branch_id || null, project_id: order.project_id || null, cost_center_id: order.cost_center_id || null },
    ];
    const { error: lErr } = await supabase.from("journal_lines").insert(lines);
    if (lErr) throw new Error(lErr.message);

    const { error: updErr } = await supabase
      .from("sales_order_deposits")
      .update({ status: "posted", journal_entry_id: je!.id, posted_at: new Date().toISOString() })
      .eq("id", data.id);
    if (updErr) throw new Error(updErr.message);

    return { ok: true, journal_entry_id: je!.id };
  });

export const voidSalesOrderDeposit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string; reason?: string }) =>
    z.object({ id: z.string().uuid(), reason: z.string().max(500).optional() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("sales_order_deposits")
      .update({ status: "void", void_reason: data.reason || null, voided_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteSalesOrderDeposit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string }) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: dep } = await context.supabase
      .from("sales_order_deposits").select("status").eq("id", data.id).single();
    if ((dep as any)?.status === "posted") throw new Error("Phiếu đã ghi sổ — vui lòng huỷ trước khi xoá");
    const { error } = await context.supabase.from("sales_order_deposits").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Stock reservations ----------

export const listReservationsForOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { orderId: string }) => z.object({ orderId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: lines } = await context.supabase
      .from("sales_order_lines").select("id, product_id, warehouse_id, qty_ordered, qty_delivered, description")
      .eq("order_id", data.orderId);
    const ids = (lines ?? []).map((l: any) => l.id);
    if (ids.length === 0) return { reservations: [], lines: [] };
    const { data: res } = await context.supabase
      .from("stock_reservations").select("*").in("ref_id", ids).eq("ref_type", "sales_order");
    return { reservations: res ?? [], lines: lines ?? [] };
  });

export const getStockAvailability = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { productId: string; warehouseId?: string | null }) =>
    z.object({ productId: z.string().uuid(), warehouseId: z.string().uuid().nullable().optional() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: onHand } = await context.supabase
      .rpc("fn_product_on_hand", { p_product: data.productId, p_warehouse: data.warehouseId ?? null });
    const { data: reserved } = await context.supabase
      .rpc("fn_product_reserved_qty", { p_product: data.productId, p_warehouse: data.warehouseId ?? null });
    const oh = Number(onHand ?? 0);
    const rv = Number(reserved ?? 0);
    return { on_hand: oh, reserved: rv, available: oh - rv };
  });

export const releaseReservationsForOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { orderId: string }) => z.object({ orderId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: lines } = await context.supabase
      .from("sales_order_lines").select("id").eq("order_id", data.orderId);
    const ids = (lines ?? []).map((l: any) => l.id);
    if (ids.length === 0) return { ok: true };
    const { error } = await context.supabase
      .from("stock_reservations")
      .update({ status: "cancelled", released_at: new Date().toISOString() })
      .in("ref_id", ids).eq("ref_type", "sales_order").eq("status", "active");
    if (error) throw new Error(error.message);
    return { ok: true };
  });
