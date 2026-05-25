import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { normalizeLineName } from "@/lib/ai/classify-line";
import { invalidateTenantClassifyContext } from "@/lib/categorize/classify-context.server";

async function activeTenantId(supabase: any, userId: string): Promise<string> {
  const { data } = await supabase
    .from("profiles")
    .select("active_tenant_id")
    .eq("id", userId)
    .maybeSingle();
  if (!data?.active_tenant_id) throw new Error("Chưa chọn doanh nghiệp");
  return data.active_tenant_id as string;
}

export const listProductCatalog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const tenantId = await activeTenantId(supabase, userId);
    const { data, error } = await supabase
      .from("tenant_product_catalog")
      .select("id, sku, name, name_norm, aliases, note, created_at, updated_at")
      .eq("tenant_id", tenantId)
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);
    return { items: data ?? [] };
  });

const upsertSchema = z.object({
  id: z.string().uuid().optional(),
  sku: z.string().max(64).nullable().optional(),
  name: z.string().min(1).max(255),
  aliases: z.array(z.string().min(1).max(255)).max(20).optional(),
  note: z.string().max(500).nullable().optional(),
});

export const upsertProductCatalog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => upsertSchema.parse(input))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const tenantId = await activeTenantId(supabase, userId);
    const name_norm = normalizeLineName(data.name);
    if (!name_norm) throw new Error("Tên không hợp lệ");

    const payload = {
      tenant_id: tenantId,
      sku: data.sku ?? null,
      name: data.name,
      name_norm,
      aliases: data.aliases ?? [],
      note: data.note ?? null,
      created_by: userId,
    };

    if (data.id) {
      const { error } = await supabase
        .from("tenant_product_catalog")
        .update(payload)
        .eq("id", data.id)
        .eq("tenant_id", tenantId);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase
        .from("tenant_product_catalog")
        .insert(payload);
      if (error) throw new Error(error.message);
    }
    invalidateTenantClassifyContext(tenantId);
    return { ok: true };
  });

export const deleteProductCatalog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const tenantId = await activeTenantId(supabase, userId);
    const { error } = await supabase
      .from("tenant_product_catalog")
      .delete()
      .eq("id", data.id)
      .eq("tenant_id", tenantId);
    if (error) throw new Error(error.message);
    invalidateTenantClassifyContext(tenantId);
    return { ok: true };
  });

const businessSchema = z.object({
  business_types: z
    .array(z.enum(["trading", "manufacturing", "service"]))
    .max(3),
  ccdc_allocation_threshold: z.number().int().min(0).max(1_000_000_000),
  default_cost_center: z.enum(["627", "641", "642"]),
});

export const updateBusinessConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => businessSchema.parse(input))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const tenantId = await activeTenantId(supabase, userId);
    const { error } = await supabase
      .from("tenants")
      .update({
        business_types: data.business_types,
        ccdc_allocation_threshold: data.ccdc_allocation_threshold,
        default_cost_center: data.default_cost_center,
      })
      .eq("id", tenantId);
    if (error) throw new Error(error.message);
    invalidateTenantClassifyContext(tenantId);
    return { ok: true };
  });

export const getBusinessConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const tenantId = await activeTenantId(supabase, userId);
    const { data, error } = await supabase
      .from("tenants")
      .select(
        "business_types, ccdc_allocation_threshold, default_cost_center, accounting_standard",
      )
      .eq("id", tenantId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return {
      business_types: (data?.business_types as string[]) ?? [],
      ccdc_allocation_threshold: Number(
        data?.ccdc_allocation_threshold ?? 5_000_000,
      ),
      default_cost_center:
        ((data?.default_cost_center as "627" | "641" | "642") ?? "642"),
      accounting_standard:
        (data?.accounting_standard as "TT200" | "TT133" | "TT99") ?? "TT133",
    };
  });
