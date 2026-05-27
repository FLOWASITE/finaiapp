import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { mergeCatalog, type DbProductRow, type DbTpcRow } from "./adapt";
import type { CatalogItem } from "@/types/catalog";

async function activeTenantId(supabase: any, userId: string): Promise<string | null> {
  const { data } = await supabase
    .from("profiles")
    .select("active_tenant_id")
    .eq("id", userId)
    .maybeSingle();
  return (data?.active_tenant_id as string | undefined) ?? null;
}

export const loadCatalog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ items: CatalogItem[] }> => {
    const { supabase, userId } = context;
    const tenantId = await activeTenantId(supabase, userId);
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
        .select("id, sku, name, name_norm, aliases, note")
        .eq("tenant_id", tenantId)
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
