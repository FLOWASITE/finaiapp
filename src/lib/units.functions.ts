import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const UnitSchema = z.object({
  id: z.string().uuid().optional(),
  code: z.string().min(1).max(20),
  name: z.string().min(1).max(120),
  note: z.string().max(255).nullable().optional(),
  is_active: z.boolean().default(true),
});

export const listUnits = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("product_units")
      .select("*")
      .order("code");
    if (error) throw new Error(error.message);
    // include usage count
    const { data: prods } = await supabase.from("products").select("unit");
    const usage = new Map<string, number>();
    for (const p of prods ?? []) {
      const k = (p.unit ?? "").toLowerCase();
      if (!k) continue;
      usage.set(k, (usage.get(k) ?? 0) + 1);
    }
    return (data ?? []).map((u: any) => ({ ...u, usage: usage.get(u.code.toLowerCase()) ?? 0 }));
  });

export const upsertUnit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => UnitSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles").select("active_tenant_id").eq("id", userId).maybeSingle();
    const payload: any = { ...data, user_id: userId, tenant_id: profile?.active_tenant_id ?? null };
    if (data.id) {
      const { error } = await supabase.from("product_units").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await supabase.from("product_units").insert(payload).select("id").single();
    if (error) throw new Error(error.message);
    return { id: row!.id };
  });

export const deleteUnit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string }) => i)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: row } = await supabase.from("product_units").select("code").eq("id", data.id).maybeSingle();
    if (row) {
      const { count } = await supabase
        .from("products").select("id", { count: "exact", head: true })
        .ilike("unit", row.code);
      if ((count ?? 0) > 0) throw new Error(`Đang có ${count} mặt hàng dùng đơn vị này — hãy đổi trước`);
    }
    const { error } = await supabase.from("product_units").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
