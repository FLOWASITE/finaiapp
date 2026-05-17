import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ProductSchema = z.object({
  id: z.string().optional(),
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(255),
  unit: z.string().min(1).max(20).default("cái"),
  unit_cost: z.number().min(0).default(0),
  unit_price: z.number().min(0).default(0),
  stock_account: z.string().default("156"),
  revenue_account: z.string().default("511"),
  cogs_account: z.string().default("632"),
  vat_rate: z.number().min(0).max(100).default(10),
});

export const listProducts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .order("code");
    if (error) throw new Error(error.message);
    return data;
  });

export const upsertProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => ProductSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const payload = { ...data, user_id: userId };
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
      .select("on_hand, unit_cost")
      .eq("id", data.product_id)
      .single();
    if (pErr || !product) throw new Error("Không tìm thấy mặt hàng");

    let newOnHand = Number(product.on_hand);
    let newCost = Number(product.unit_cost);
    if (data.movement_type === "in") {
      // bình quân gia quyền: ((on_hand*cost) + (qty*new_cost)) / (on_hand+qty)
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
      product_id: data.product_id,
      movement_type: data.movement_type,
      qty: data.qty,
      unit_cost: data.movement_type === "in" ? data.unit_cost : Number(product.unit_cost),
      movement_date: data.movement_date,
      note: data.note,
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
      .select("id, code, name, unit, on_hand, unit_cost")
      .order("code");
    if (error) throw new Error(error.message);
    return (data ?? []).map((p) => ({
      ...p,
      value: Number(p.on_hand) * Number(p.unit_cost),
    }));
  });
