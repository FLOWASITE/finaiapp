import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertTenantMember } from "@/lib/auth/active-tenant.server";
import { COMMON_UNITS as COMMON_UNITS_LIST, findCommonUnit } from "./common-units";

const UnitSchema = z.object({
  id: z.string().uuid().optional(),
  code: z.string().min(1).max(20),
  name: z.string().min(1).max(120),
  note: z.string().max(255).nullable().optional(),
  is_active: z.boolean().default(true),
});

function normalizeCode(s: string): string {
  return s.trim().replace(/\s+/g, " ");
}

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
    const code = normalizeCode(data.code);
    // Auto-fill canonical name from common units catalog when name missing or matches code.
    let name = data.name?.trim() || "";
    const match = findCommonUnit(code);
    if (match && (!name || name.toLowerCase() === code.toLowerCase())) {
      name = match.name;
    }
    if (!name) name = code;
    const payload: any = { ...data, code, name, user_id: userId, tenant_id: profile?.active_tenant_id ?? null };
    if (data.id) {
      const { error } = await supabase.from("product_units").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    // Check duplicate (case-insensitive) for this tenant
    const { data: dup } = await supabase
      .from("product_units").select("id").ilike("code", code).maybeSingle();
    if (dup) throw new Error(`Đơn vị "${code}" đã tồn tại`);
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

export const COMMON_UNITS = COMMON_UNITS_LIST;

export const seedCommonUnits = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles").select("active_tenant_id").eq("id", userId).maybeSingle();
    const tenant_id = profile?.active_tenant_id ?? null;
    if (tenant_id) await assertTenantMember(supabase, userId, tenant_id);
    const { data: existing } = await supabase
      .from("product_units").select("code");
    const have = new Set((existing ?? []).map((r: any) => r.code.toLowerCase()));
    const toInsert = COMMON_UNITS
      .filter((u) => !have.has(u.code.toLowerCase()))
      .map((u) => ({ ...u, user_id: userId, tenant_id, is_active: true }));
    if (toInsert.length === 0) return { inserted: 0 };
    const { error } = await supabase.from("product_units").insert(toInsert);
    if (error) throw new Error(error.message);
    return { inserted: toInsert.length };
  });
