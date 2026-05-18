import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ConversionSchema = z.object({
  id: z.string().uuid().optional(),
  product_id: z.string().uuid(),
  unit: z.string().min(1).max(20),
  factor: z.number().positive(),
  is_default_purchase: z.boolean().default(false),
  is_default_sale: z.boolean().default(false),
  note: z.string().max(255).nullable().optional(),
});

export const listConversions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { product_id: string }) => i)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("product_unit_conversions")
      .select("*")
      .eq("product_id", data.product_id)
      .order("factor", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const listConversionsBulk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { product_ids: string[] }) => i)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    if (!data.product_ids?.length) return {};
    const { data: rows, error } = await supabase
      .from("product_unit_conversions")
      .select("*")
      .in("product_id", data.product_ids);
    if (error) throw new Error(error.message);
    const map: Record<string, any[]> = {};
    for (const r of rows ?? []) {
      (map[r.product_id] ||= []).push(r);
    }
    return map;
  });

export const upsertConversion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => ConversionSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles").select("active_tenant_id").eq("id", userId).maybeSingle();
    const tenant_id = profile?.active_tenant_id ?? null;

    // Disallow conflict with the base unit of the product
    const { data: product } = await supabase
      .from("products").select("unit").eq("id", data.product_id).maybeSingle();
    if (product?.unit && product.unit.toLowerCase() === data.unit.toLowerCase()) {
      throw new Error("Đơn vị này trùng với đơn vị gốc của mặt hàng (hệ số luôn = 1)");
    }

    const payload: any = { ...data, user_id: userId, tenant_id };
    if (data.id) {
      const { error } = await supabase
        .from("product_unit_conversions").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await supabase
      .from("product_unit_conversions").insert(payload).select("id").single();
    if (error) throw new Error(error.message);
    return { id: row!.id };
  });

export const deleteConversion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string }) => i)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("product_unit_conversions").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
