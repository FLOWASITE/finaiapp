import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ProductSchema = z.object({
  id: z.string().optional(),
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(255),
  item_type: z.enum(["goods", "service", "combo"]).default("goods"),
  unit: z.string().min(1).max(20).default("cái"),
  unit_cost: z.number().min(0).default(0),
  unit_price: z.number().min(0).default(0),
  stock_account: z.string().default("156"),
  revenue_account: z.string().default("511"),
  cogs_account: z.string().default("632"),
  vat_rate: z.number().min(0).max(100).default(10),
  category_id: z.string().uuid().nullable().optional(),
  barcode: z.string().max(100).nullable().optional(),
  min_stock: z.number().min(0).default(0),
  max_stock: z.number().min(0).default(0),
  is_active: z.boolean().default(true),
  notes: z.string().max(1000).nullable().optional(),
});

export const listProducts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("products")
      .select("*, product_categories(name)")
      .order("code");
    if (error) throw new Error(error.message);
    return data;
  });

export const getProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string }) => i)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const [{ data: product, error: pErr }, { data: movements, error: mErr }] = await Promise.all([
      supabase.from("products").select("*, product_categories(name)").eq("id", data.id).maybeSingle(),
      supabase
        .from("stock_movements")
        .select("*")
        .eq("product_id", data.id)
        .order("movement_date", { ascending: true })
        .order("created_at", { ascending: true })
        .limit(500),
    ]);
    if (pErr) throw new Error(pErr.message);
    if (!product) throw new Error("Không tìm thấy mặt hàng");
    if (mErr) throw new Error(mErr.message);
    // running balance
    let running = 0;
    const kardex = (movements ?? []).map((m: any) => {
      const qtyIn = m.movement_type === "in" ? Number(m.qty) : 0;
      const qtyOut = m.movement_type === "out" ? Number(m.qty) : 0;
      running += qtyIn - qtyOut;
      return { ...m, qty_in: qtyIn, qty_out: qtyOut, balance: running };
    });
    // reverse to show newest first
    return { product, kardex: kardex.reverse() };
  });

export const upsertProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => ProductSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase.from("profiles").select("active_tenant_id").eq("id", userId).maybeSingle();
    const payload: any = { ...data, user_id: userId, tenant_id: profile?.active_tenant_id ?? null };
    if (data.id) {
      const { error } = await supabase.from("products").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await supabase.from("products").insert(payload).select("id").single();
    if (error) throw new Error(error.message);
    return { id: row!.id };
  });

const MovementSchema = z.object({
  product_id: z.string().uuid(),
  movement_type: z.enum(["in", "out"]),
  qty: z.number().positive(),
  unit_cost: z.number().min(0),
  movement_date: z.string(),
  note: z.string().max(255).optional(),
});

export const recordMovement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => MovementSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: product, error: pErr } = await supabase
      .from("products")
      .select("on_hand, unit_cost, tenant_id, item_type")
      .eq("id", data.product_id)
      .single();
    if (pErr || !product) throw new Error("Không tìm thấy mặt hàng");
    if ((product as any).item_type === "service") {
      throw new Error("Dịch vụ không quản lý tồn kho");
    }

    let newOnHand = Number(product.on_hand);
    let newCost = Number(product.unit_cost);
    if (data.movement_type === "in") {
      const totalQty = newOnHand + data.qty;
      newCost = totalQty > 0
        ? (newOnHand * newCost + data.qty * data.unit_cost) / totalQty
        : data.unit_cost;
      newOnHand = totalQty;
    } else {
      if (data.qty > newOnHand) throw new Error(`Tồn không đủ. Hiện có ${newOnHand}`);
      newOnHand -= data.qty;
    }

    await supabase.from("stock_movements").insert({
      user_id: userId,
      tenant_id: product.tenant_id,
      product_id: data.product_id,
      movement_type: data.movement_type,
      qty: data.qty,
      unit_cost: data.movement_type === "in" ? data.unit_cost : Number(product.unit_cost),
      movement_date: data.movement_date,
      note: data.note,
      ref_type: "manual",
    });

    await supabase
      .from("products")
      .update({ on_hand: newOnHand, unit_cost: newCost })
      .eq("id", data.product_id);

    return { ok: true, on_hand: newOnHand, unit_cost: newCost };
  });

export const getStockReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("products")
      .select("id, code, name, unit, item_type, on_hand, unit_cost, min_stock, is_active, category_id, product_categories(name)")
      .order("code");
    if (error) throw new Error(error.message);
    return (data ?? []).map((p: any) => ({
      ...p,
      value: p.item_type === "service" ? 0 : Number(p.on_hand) * Number(p.unit_cost),
      low_stock: p.item_type !== "service" && Number(p.min_stock) > 0 && Number(p.on_hand) <= Number(p.min_stock),
    }));
  });

export const listMovements = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { from?: string; to?: string; product_id?: string; type?: string }) => i)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    let q = supabase
      .from("stock_movements")
      .select("*, products(code, name, unit)")
      .order("movement_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(500);
    if (data.from) q = q.gte("movement_date", data.from);
    if (data.to) q = q.lte("movement_date", data.to);
    if (data.product_id) q = q.eq("product_id", data.product_id);
    if (data.type && data.type !== "all") q = q.eq("movement_type", data.type);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows;
  });

export const inventoryDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const today = new Date();
    const d30 = new Date(today.getTime() - 30 * 86400000).toISOString().slice(0, 10);

    const [{ data: products = [] }, { data: movs30 = [] }] = await Promise.all([
      supabase
        .from("products")
        .select("id, code, name, unit, item_type, on_hand, unit_cost, min_stock, is_active")
        .eq("is_active", true),
      supabase
        .from("stock_movements")
        .select("movement_type, qty, unit_cost")
        .gte("movement_date", d30),
    ]);

    const enriched = (products ?? []).map((p: any) => ({
      ...p,
      value: p.item_type === "service" ? 0 : Number(p.on_hand) * Number(p.unit_cost),
      low_stock: p.item_type !== "service" && Number(p.min_stock) > 0 && Number(p.on_hand) <= Number(p.min_stock),
    }));
    const goods = enriched.filter((p: any) => p.item_type !== "service");
    const services = enriched.filter((p: any) => p.item_type === "service");
    const totalValue = goods.reduce((s, p) => s + p.value, 0);
    const lowStock = goods.filter((p) => p.low_stock);
    const topValue = [...goods].sort((a, b) => b.value - a.value).slice(0, 8);

    const inValue = (movs30 ?? [])
      .filter((m: any) => m.movement_type === "in")
      .reduce((s: number, m: any) => s + Number(m.qty) * Number(m.unit_cost || 0), 0);
    const outValue = (movs30 ?? [])
      .filter((m: any) => m.movement_type === "out")
      .reduce((s: number, m: any) => s + Number(m.qty) * Number(m.unit_cost || 0), 0);

    return {
      total_value: totalValue,
      sku_count: enriched.length,
      goods_count: goods.length,
      service_count: services.length,
      low_stock_count: lowStock.length,
      movements_30d: (movs30 ?? []).length,
      in_value_30d: inValue,
      out_value_30d: outValue,
      low_stock_items: lowStock.slice(0, 20),
      top_value_items: topValue,
    };
  });

export const listCategories = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase.from("product_categories").select("*").order("name");
    if (error) throw new Error(error.message);
    return data;
  });

const CategorySchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(120),
  parent_id: z.string().uuid().nullable().optional(),
});

export const upsertCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => CategorySchema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase.from("profiles").select("active_tenant_id").eq("id", userId).maybeSingle();
    const payload: any = { ...data, user_id: userId, tenant_id: profile?.active_tenant_id ?? null };
    if (data.id) {
      const { error } = await supabase.from("product_categories").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await supabase.from("product_categories").insert(payload).select("id").single();
    if (error) throw new Error(error.message);
    return { id: row!.id };
  });

export const deleteCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string }) => i)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    // Guard: chặn xoá nếu còn nhóm con hoặc còn SKU
    const [{ count: childCount }, { count: skuCount }] = await Promise.all([
      supabase.from("product_categories").select("id", { count: "exact", head: true }).eq("parent_id", data.id),
      supabase.from("products").select("id", { count: "exact", head: true }).eq("category_id", data.id),
    ]);
    if ((childCount ?? 0) > 0) throw new Error("Nhóm còn nhóm con — hãy xoá/di chuyển nhóm con trước");
    if ((skuCount ?? 0) > 0) throw new Error(`Nhóm còn ${skuCount} mặt hàng — hãy chuyển nhóm trước`);
    const { error } = await supabase.from("product_categories").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listCategoriesTree = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const [{ data: cats, error: cErr }, { data: prods, error: pErr }] = await Promise.all([
      supabase.from("product_categories").select("id, name, parent_id").order("name"),
      supabase.from("products").select("category_id"),
    ]);
    if (cErr) throw new Error(cErr.message);
    if (pErr) throw new Error(pErr.message);
    const directCount = new Map<string, number>();
    for (const p of prods ?? []) {
      if (!p.category_id) continue;
      directCount.set(p.category_id, (directCount.get(p.category_id) ?? 0) + 1);
    }
    return (cats ?? []).map((c: any) => ({ ...c, sku_count: directCount.get(c.id) ?? 0 }));
  });

const BulkAssignSchema = z.object({
  product_ids: z.array(z.string().uuid()).min(1).max(500),
  category_id: z.string().uuid().nullable(),
});

export const bulkAssignCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => BulkAssignSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("products")
      .update({ category_id: data.category_id })
      .in("id", data.product_ids);
    if (error) throw new Error(error.message);
    return { ok: true, count: data.product_ids.length };
  });

export const listProductsByCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { category_id: string | null }) => i)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    let q = supabase
      .from("products")
      .select("id, code, name, unit, item_type, on_hand, is_active")
      .order("code");
    if (data.category_id === null) q = q.is("category_id", null);
    else q = q.eq("category_id", data.category_id);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

