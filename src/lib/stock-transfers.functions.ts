import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertTenantMember } from "@/lib/auth/active-tenant.server";

const TransferLineSchema = z.object({
  product_id: z.string().uuid(),
  qty: z.number().positive(),
  unit_cost: z.number().min(0).default(0),
  note: z.string().max(500).nullable().optional(),
});

const TransferCreateSchema = z.object({
  voucher_no: z.string().max(50).optional(),
  voucher_date: z.string(),
  from_warehouse_id: z.string().uuid(),
  to_warehouse_id: z.string().uuid(),
  reason: z.string().max(500).nullable().optional(),
  lines: z.array(TransferLineSchema).min(1),
});

async function recomputeProductStock(supabase: any, productId: string) {
  const { data: movs, error } = await supabase
    .from("stock_movements")
    .select("movement_type, qty, unit_cost, movement_date, created_at")
    .eq("product_id", productId)
    .order("movement_date", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  let qty = 0;
  let cost = 0;
  for (const m of (movs ?? []) as any[]) {
    const q = Number(m.qty);
    const u = Number(m.unit_cost || 0);
    if (m.movement_type === "in") {
      const total = qty + q;
      cost = total > 0 ? (qty * cost + q * u) / total : u;
      qty = total;
    } else if (m.movement_type === "out") {
      qty -= q;
    }
    // transfer movements: skip (warehouse-to-warehouse, net zero on company)
  }
  await supabase.from("products").update({ on_hand: qty, unit_cost: cost }).eq("id", productId);
  return { on_hand: qty, unit_cost: cost };
}

async function nextTransferNo(supabase: any, userId: string, date: string) {
  const year = date.slice(0, 4);
  const prefix = `CK${year}`;
  const { data } = await supabase
    .from("stock_vouchers")
    .select("voucher_no")
    .eq("user_id", userId)
    .eq("voucher_type", "transfer")
    .like("voucher_no", `${prefix}%`)
    .order("voucher_no", { ascending: false })
    .limit(1);
  const last = data?.[0]?.voucher_no as string | undefined;
  const seq = last ? parseInt(last.slice(prefix.length), 10) + 1 : 1;
  return `${prefix}${String(seq).padStart(5, "0")}`;
}

export const createStockTransfer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => TransferCreateSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (data.from_warehouse_id === data.to_warehouse_id) {
      throw new Error("Kho xuất và kho nhập phải khác nhau");
    }
    const { data: profile } = await supabase
      .from("profiles")
      .select("active_tenant_id")
      .eq("id", userId)
      .maybeSingle();
    const tenantId = profile?.active_tenant_id ?? null;
    if (tenantId) await assertTenantMember(supabase, userId, tenantId);

    const voucherNo = data.voucher_no?.trim() || (await nextTransferNo(supabase, userId, data.voucher_date));

    const { data: hdr, error: hErr } = await supabase
      .from("stock_vouchers")
      .insert({
        user_id: userId,
        tenant_id: tenantId,
        voucher_no: voucherNo,
        voucher_type: "transfer",
        voucher_date: data.voucher_date,
        warehouse_id: data.from_warehouse_id,
        target_warehouse_id: data.to_warehouse_id,
        counter_account: "156",
        reason: data.reason ?? null,
      })
      .select("id")
      .single();
    if (hErr || !hdr) throw new Error(hErr?.message || "Không tạo được phiếu chuyển kho");

    try {
      const movRows: any[] = [];
      for (const ln of data.lines) {
        // out from source
        movRows.push({
          user_id: userId,
          tenant_id: tenantId,
          product_id: ln.product_id,
          warehouse_id: data.from_warehouse_id,
          voucher_id: hdr.id,
          movement_type: "out",
          qty: ln.qty,
          unit_cost: ln.unit_cost,
          movement_date: data.voucher_date,
          note: ln.note ?? `Chuyển kho ${voucherNo}`,
          ref_type: "transfer",
        });
        // in at destination
        movRows.push({
          user_id: userId,
          tenant_id: tenantId,
          product_id: ln.product_id,
          warehouse_id: data.to_warehouse_id,
          voucher_id: hdr.id,
          movement_type: "in",
          qty: ln.qty,
          unit_cost: ln.unit_cost,
          movement_date: data.voucher_date,
          note: ln.note ?? `Chuyển kho ${voucherNo}`,
          ref_type: "transfer",
        });
      }
      const { error: mErr } = await supabase.from("stock_movements").insert(movRows);
      if (mErr) throw new Error(mErr.message);

      const productIds = Array.from(new Set(data.lines.map((l) => l.product_id)));
      for (const pid of productIds) await recomputeProductStock(supabase, pid);

      return { ok: true, id: hdr.id, voucher_no: voucherNo };
    } catch (e) {
      await supabase.from("stock_vouchers").delete().eq("id", hdr.id);
      throw e;
    }
  });

export const listStockTransfers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { from?: string; to?: string }) => i)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    let q = supabase
      .from("stock_vouchers")
      .select(
        "*, from_warehouse:warehouses!stock_vouchers_warehouse_id_fkey(code, name), to_warehouse:warehouses!stock_vouchers_target_warehouse_id_fkey(code, name), stock_movements(qty, unit_cost, product_id, movement_type, products(code, name, unit))",
      )
      .eq("voucher_type", "transfer")
      .order("voucher_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(500);
    if (data.from) q = q.gte("voucher_date", data.from);
    if (data.to) q = q.lte("voucher_date", data.to);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []).map((v: any) => {
      const outLines = (v.stock_movements ?? []).filter((m: any) => m.movement_type === "out");
      const total_qty = outLines.reduce((s: number, l: any) => s + Number(l.qty || 0), 0);
      const total_value = outLines.reduce(
        (s: number, l: any) => s + Number(l.qty || 0) * Number(l.unit_cost || 0),
        0,
      );
      return { ...v, line_count: outLines.length, total_qty, total_value };
    });
  });

export const cancelStockTransfer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string }) => i)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: movs } = await supabase
      .from("stock_movements")
      .select("product_id")
      .eq("voucher_id", data.id);
    const productIds = Array.from(new Set((movs ?? []).map((m: any) => m.product_id))) as string[];
    await supabase.from("stock_movements").delete().eq("voucher_id", data.id);
    await supabase.from("stock_vouchers").delete().eq("id", data.id);
    for (const pid of productIds) await recomputeProductStock(supabase, pid);
    return { ok: true };
  });
