/**
 * Load ClassifyContextV2 từ tenant + supplier — cache theo tenant_id.
 * Server-only.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  normalizeLineName,
} from "@/lib/ai/classify-line";
import type {
  AccountingStandard,
  BusinessType,
  ClassifyContextV2,
  SupplierRole,
} from "@/lib/ai/classify-line-v2";

type TenantCfg = {
  accounting_standard: AccountingStandard;
  business_types: BusinessType[];
  ccdc_allocation_threshold: number;
  default_cost_center: "627" | "641" | "642";
  vsic_codes: string[];
  product_catalog_norm: Set<string>;
};

const cache = new Map<string, { at: number; cfg: TenantCfg }>();
const TTL_MS = 5 * 60 * 1000;

export async function getTenantClassifyContext(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<TenantCfg> {
  const hit = cache.get(tenantId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.cfg;

  const [{ data: t }, { data: catalog }] = await Promise.all([
    supabase
      .from("tenants")
      .select(
        "accounting_standard, business_types, ccdc_allocation_threshold, default_cost_center, industry_code, industries",
      )
      .eq("id", tenantId)
      .maybeSingle(),
    supabase
      .from("tenant_product_catalog")
      .select("name_norm, aliases")
      .eq("tenant_id", tenantId),
  ]);

  const set = new Set<string>();
  for (const row of catalog ?? []) {
    if (row.name_norm) set.add(row.name_norm);
    for (const a of (row.aliases ?? []) as string[]) {
      const n = normalizeLineName(a);
      if (n) set.add(n);
    }
  }

  const vsic: string[] = [];
  if (t?.industry_code) vsic.push(String(t.industry_code));
  for (const i of (t?.industries ?? []) as Array<{ code?: string }>) {
    if (i?.code) vsic.push(String(i.code));
  }

  const cfg: TenantCfg = {
    accounting_standard:
      (t?.accounting_standard as AccountingStandard) ?? "TT133",
    business_types: ((t?.business_types as BusinessType[]) ?? []).filter(
      (x): x is BusinessType =>
        x === "trading" || x === "manufacturing" || x === "service",
    ),
    ccdc_allocation_threshold: Number(t?.ccdc_allocation_threshold ?? 5_000_000),
    default_cost_center:
      ((t?.default_cost_center as "627" | "641" | "642") ?? "642"),
    vsic_codes: vsic,
    product_catalog_norm: set,
  };

  cache.set(tenantId, { at: Date.now(), cfg });
  return cfg;
}

export function invalidateTenantClassifyContext(tenantId: string) {
  cache.delete(tenantId);
}

export async function getVendorRolesAndVsic(
  supabase: SupabaseClient,
  supplierId: string | null,
): Promise<{
  mst?: string | null;
  vsic?: string | null;
  roles: SupplierRole[];
}> {
  if (!supplierId) return { roles: [] };
  const { data } = await supabase
    .from("suppliers")
    .select("tax_id, industry_code, roles")
    .eq("id", supplierId)
    .maybeSingle();
  return {
    mst: data?.tax_id ?? null,
    vsic: data?.industry_code ?? null,
    roles: ((data?.roles as SupplierRole[]) ?? []).filter(
      (x): x is SupplierRole =>
        x === "resale_source" ||
        x === "raw_material_source" ||
        x === "service_provider" ||
        x === "asset_vendor",
    ),
  };
}

export function buildClassifyContextV2(
  tenant: TenantCfg,
  vendor?: { mst?: string | null; vsic?: string | null; roles?: SupplierRole[] },
): ClassifyContextV2 {
  return {
    tenant,
    vendor: vendor ?? undefined,
  };
}
