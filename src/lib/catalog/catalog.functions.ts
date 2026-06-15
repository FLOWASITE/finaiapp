import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveActiveTenantId } from "@/lib/auth/active-tenant.server";
import { mergeCatalog, type DbProductRow, type DbTpcRow } from "./adapt";
import type { CatalogItem } from "@/types/catalog";

export const loadCatalog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ items: CatalogItem[] }> => {
    const { supabase, userId } = context;
    const tenantId = await resolveActiveTenantId(supabase, userId);
    if (!tenantId) return { items: [] };

    const [productsRes, tpcRes] = await Promise.all([
      supabase
        .from("products")
        .select(
          "id, code, name, unit, unit_cost, unit_price, stock_account, revenue_account, cogs_account, expense_account, vat_rate, on_hand, is_active, notes, item_type, aliases, category_id, product_categories(name)",
        )
        .eq("tenant_id", tenantId)
        .order("name", { ascending: true }),
      supabase
        .from("tenant_product_catalog")
        .select("id, sku, name, name_norm, aliases, note, category, subcategory, item_type, default_account, vat_rate")
        .or(`tenant_id.eq.${tenantId},is_global.eq.true`)
        .order("name", { ascending: true }),
    ]);

    if (productsRes.error) throw new Error(productsRes.error.message);
    if (tpcRes.error) throw new Error(tpcRes.error.message);

    const items = mergeCatalog(
      (productsRes.data ?? []) as DbProductRow[],
      (tpcRes.data ?? []) as DbTpcRow[],
    );
    return { items };
  });

// ---------------------------------------------------------------------------
// CRUD: ghi thẳng vào bảng `products`
// ---------------------------------------------------------------------------

const CatalogItemInput = z
  .object({
    id: z.string().optional(),
    code: z.string().min(1).max(50),
    name: z.string().min(1).max(255),
    itemType: z.enum(["service", "goods", "mixed"]).default("goods"),
    defaultAccountTT99: z.string().min(2).max(10).optional(),
    aliases: z.array(z.string()).optional(),
    notes: z.string().nullable().optional(),
    vatRateStandard: z.number().min(0).max(1).optional(),
    isActive: z.boolean().optional(),
    unit: z.string().max(20).optional(),
    can_be_sold: z.boolean().optional(),
    can_be_purchased: z.boolean().optional(),
  })
  .passthrough();

function makeProductPayload(
  item: z.infer<typeof CatalogItemInput>,
  userId: string,
  tenantId: string,
) {
  const itemType: "goods" | "service" =
    item.itemType === "service" ? "service" : "goods";
  const acct = item.defaultAccountTT99 || (itemType === "service" ? "642" : "156");
  return {
    user_id: userId,
    tenant_id: tenantId,
    code: item.code,
    name: item.name,
    item_type: itemType,
    unit: item.unit ?? "cái",
    stock_account: itemType === "goods" ? acct : null,
    expense_account: itemType === "service" ? acct : null,
    revenue_account: "511",
    cogs_account: "632",
    vat_rate: Math.round(((item.vatRateStandard ?? 0.1) as number) * 100),
    aliases: item.aliases ?? [],
    notes: item.notes ?? null,
    is_active: item.isActive !== false,
    can_be_sold: item.can_be_sold ?? true,
    can_be_purchased: item.can_be_purchased ?? true,
  };
}

export const upsertCatalogItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ item: CatalogItemInput }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const tenantId = await resolveActiveTenantId(supabase, userId);
    if (!tenantId) throw new Error("Chưa chọn doanh nghiệp hoạt động");

    const payload = makeProductPayload(data.item, userId, tenantId);

    // Nếu có id, kiểm tra xem có phải là bản ghi products (không phải TPC)
    let productId: string | null = null;
    if (data.item.id) {
      const { data: existing } = await supabase
        .from("products")
        .select("id")
        .eq("id", data.item.id)
        .eq("tenant_id", tenantId)
        .maybeSingle();
      if (existing) productId = existing.id;
    }

    if (productId) {
      const { error } = await supabase
        .from("products")
        .update(payload)
        .eq("id", productId);
      if (error) throw new Error(error.message);
      return { id: productId };
    }

    const { data: row, error } = await supabase
      .from("products")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row!.id };
  });

export const softDeleteCatalogItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const tenantId = await resolveActiveTenantId(supabase, userId);
    if (!tenantId) throw new Error("Chưa chọn doanh nghiệp hoạt động");
    const { error } = await supabase
      .from("products")
      .update({ is_active: false })
      .eq("id", data.id)
      .eq("tenant_id", tenantId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
