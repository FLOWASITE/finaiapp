import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertTenantMember } from "@/lib/auth/active-tenant.server";

const WarehouseSchema = z.object({
  id: z.string().uuid().optional(),
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(255),
  address: z.string().max(500).nullable().optional(),
  manager: z.string().max(255).nullable().optional(),
  phone: z.string().max(50).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
  is_default: z.boolean().default(false),
  is_active: z.boolean().default(true),
});

// Server-side helper: returns the default warehouse id for the current user.
// If the tenant has no warehouses at all, auto-seeds a "Kho Chính" marked as default.
// If warehouses exist but none is default, promotes the first one to default.
export async function ensureDefaultWarehouseId(
  supabase: any,
  userId: string,
): Promise<string> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("active_tenant_id")
    .eq("id", userId)
    .maybeSingle();
  const tenant_id = profile?.active_tenant_id ?? null;
    if (tenant_id) await assertTenantMember(supabase, userId, tenant_id);

  let scoped = supabase.from("warehouses").select("id, is_default, code").order("code");
  scoped = tenant_id ? scoped.eq("tenant_id", tenant_id) : scoped.eq("user_id", userId);
  const { data: rows } = await scoped;

  const list = (rows ?? []) as { id: string; is_default: boolean; code: string }[];
  const existingDefault = list.find((w) => w.is_default);
  if (existingDefault) return existingDefault.id;

  if (list.length > 0) {
    await supabase.from("warehouses").update({ is_default: true }).eq("id", list[0].id);
    return list[0].id;
  }

  // Seed "Kho Chính"
  const { data: created, error: cerr } = await supabase
    .from("warehouses")
    .insert({
      user_id: userId,
      tenant_id,
      code: "KC",
      name: "Kho Chính",
      is_default: true,
      is_active: true,
    })
    .select("id")
    .single();
  if (cerr || !created) throw new Error(cerr?.message || "Không tạo được kho mặc định");
  return created.id;
}

export const getDefaultWarehouseId = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const id = await ensureDefaultWarehouseId(context.supabase, context.userId);
    return { id };
  });

export const listWarehouses = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    // Make sure tenant has at least one warehouse — auto-seed "Kho Chính" if missing.
    await ensureDefaultWarehouseId(supabase, userId);

    const { data: profile } = await supabase
      .from("profiles")
      .select("active_tenant_id")
      .eq("id", userId)
      .maybeSingle();
    const tenant_id = profile?.active_tenant_id ?? null;
    if (tenant_id) await assertTenantMember(supabase, userId, tenant_id);

    let whQ = supabase.from("warehouses").select("*").order("code");
    whQ = tenant_id ? whQ.eq("tenant_id", tenant_id) : whQ.eq("user_id", userId);
    let mvQ = supabase
      .from("stock_movements")
      .select("warehouse_id, product_id, movement_type, qty, unit_cost");
    mvQ = tenant_id ? mvQ.eq("tenant_id", tenant_id) : mvQ.eq("user_id", userId);

    const [{ data: whs, error }, { data: movs }] = await Promise.all([whQ, mvQ]);
    if (error) throw new Error(error.message);

    // Aggregate stock by warehouse
    const agg = new Map<string, { value: number; products: Set<string> }>();
    for (const m of movs ?? []) {
      if (!m.warehouse_id) continue;
      const sign = m.movement_type === "in" ? 1 : -1;
      const v = sign * Number(m.qty) * Number(m.unit_cost || 0);
      const cur = agg.get(m.warehouse_id) ?? { value: 0, products: new Set<string>() };
      cur.value += v;
      cur.products.add(m.product_id);
      agg.set(m.warehouse_id, cur);
    }
    return (whs ?? []).map((w: any) => {
      const a = agg.get(w.id);
      return {
        ...w,
        stock_value: a?.value ?? 0,
        sku_count: a?.products.size ?? 0,
      };
    });
  });

export const upsertWarehouse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => WarehouseSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("active_tenant_id")
      .eq("id", userId)
      .maybeSingle();
    const tenant_id = profile?.active_tenant_id ?? null;
    if (tenant_id) await assertTenantMember(supabase, userId, tenant_id);

    // If is_default, clear other defaults first
    if (data.is_default) {
      let q = supabase.from("warehouses").update({ is_default: false });
      q = tenant_id ? q.eq("tenant_id", tenant_id) : q.eq("user_id", userId);
      if (data.id) q = q.neq("id", data.id);
      await q;
    }

    const payload: any = { ...data, user_id: userId, tenant_id };
    if (data.id) {
      const { error } = await supabase.from("warehouses").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await supabase
      .from("warehouses")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row!.id };
  });

export const deleteWarehouse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string }) => i)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const [{ count: mvCount }, { count: takeCount }] = await Promise.all([
      supabase.from("stock_movements").select("id", { count: "exact", head: true }).eq("warehouse_id", data.id),
      supabase.from("stock_takes").select("id", { count: "exact", head: true }).eq("warehouse_id", data.id),
    ]);
    if ((mvCount ?? 0) > 0 || (takeCount ?? 0) > 0) {
      throw new Error(
        `Kho còn ${mvCount ?? 0} phiếu nhập/xuất và ${takeCount ?? 0} phiếu kiểm kê — hãy ngưng hoạt động thay vì xoá.`,
      );
    }
    const { error } = await supabase.from("warehouses").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setDefaultWarehouse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string }) => i)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("active_tenant_id")
      .eq("id", userId)
      .maybeSingle();
    const tenant_id = profile?.active_tenant_id ?? null;
    if (tenant_id) await assertTenantMember(supabase, userId, tenant_id);

    let q = supabase.from("warehouses").update({ is_default: false });
    q = tenant_id ? q.eq("tenant_id", tenant_id) : q.eq("user_id", userId);
    await q.neq("id", data.id);

    const { error } = await supabase.from("warehouses").update({ is_default: true }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
