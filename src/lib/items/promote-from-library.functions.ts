// Promote a row from tenant_product_catalog (library) → products (Mục của tôi).
// Also seeds a supplier_item_mappings cache entry when called from the resolver UI.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { withTenant } from "@/integrations/supabase/with-tenant";
import { normalizeName } from "./normalize";

function inferAccounts(
  defaultAccount: string | null | undefined,
  itemType: string | null | undefined,
): { stock_account: string; expense_account: string | null; item_type: "goods" | "service" } {
  const acct = (defaultAccount ?? "").trim();
  const isService = itemType === "service";
  if (["152", "153", "156", "211", "213"].includes(acct)) {
    return { stock_account: acct, expense_account: null, item_type: isService ? "service" : "goods" };
  }
  if (acct.startsWith("6") || acct === "242") {
    return { stock_account: "156", expense_account: acct, item_type: "service" };
  }
  return {
    stock_account: isService ? "156" : "156",
    expense_account: isService ? "642" : null,
    item_type: isService ? "service" : "goods",
  };
}

function suggestCode(name: string, category: string | null): string {
  const norm = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/Đ/g, "D").replace(/đ/g, "d")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, "")
    .trim()
    .split(/\s+/).slice(0, 3).map((w) => w.slice(0, 4)).join("-");
  const prefix = (category ?? "").split("_")[0]?.slice(0, 3) || "SP";
  return `${prefix}-${norm || Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

export const promoteCatalogToProduct = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i: unknown) =>
    z.object({
      catalog_id: z.string().uuid(),
      supplier_id: z.string().uuid().optional().nullable(),
      raw_name: z.string().max(500).optional().nullable(),
      raw_unit: z.string().max(64).optional().nullable(),
      unit_price: z.number().nonnegative().optional().nullable(),
    }).parse(i),
  )
  .handler(async ({ context, data }) => {
    const { supabase, tenantId, userId } = context;

    const { data: cat, error: catErr } = await supabase
      .from("tenant_product_catalog")
      .select("id, name, aliases, category, subcategory, item_type, default_account, vat_rate")
      .eq("id", data.catalog_id)
      .maybeSingle();
    if (catErr) throw new Error(catErr.message);
    if (!cat) throw new Error("Không tìm thấy mặt hàng trong thư viện");

    const acct = inferAccounts(cat.default_account, cat.item_type);

    // Try to derive a unique code; if collides, append a short suffix.
    let code = suggestCode(cat.name, cat.category);
    for (let attempt = 0; attempt < 3; attempt++) {
      const { data: exists } = await supabase
        .from("products")
        .select("id")
        .eq("user_id", userId)
        .eq("code", code)
        .maybeSingle();
      if (!exists) break;
      code = `${code}-${Math.random().toString(36).slice(2, 4).toUpperCase()}`;
    }

    const baseAliases: string[] = Array.from(
      new Set([...(cat.aliases ?? []), ...(data.raw_name ? [data.raw_name] : [])].filter(Boolean)),
    );
    const unit = data.raw_unit?.trim() || "cái";

    const { data: prod, error: insErr } = await supabase
      .from("products")
      .insert({
        tenant_id: tenantId,
        user_id: userId,
        code,
        name: cat.name,
        unit,
        item_type: acct.item_type,
        stock_account: acct.stock_account,
        expense_account: acct.expense_account,
        vat_rate: cat.vat_rate != null
          ? (Number(cat.vat_rate) <= 1 ? Number(cat.vat_rate) * 100 : Number(cat.vat_rate))
          : 10,
        unit_price: data.unit_price ?? 0,
        unit_cost: data.unit_price ?? 0,
        aliases: baseAliases,
      })
      .select("id, code, name, unit, item_type, stock_account, expense_account, vat_rate")
      .single();
    if (insErr) throw new Error(insErr.message);

    // Seed Layer-1 cache so the next identical invoice line auto-resolves.
    if (data.supplier_id && data.raw_name) {
      const raw_name_norm = normalizeName(data.raw_name);
      if (raw_name_norm) {
        await supabase.from("supplier_item_mappings").insert({
          tenant_id: tenantId,
          supplier_id: data.supplier_id,
          product_id: prod.id,
          raw_name: data.raw_name,
          raw_name_norm,
          raw_unit: data.raw_unit ?? null,
          unit_conversion_factor: 1,
          confidence: 0.95,
          match_count: 1,
          source: "library_promote",
          created_by: userId,
        });
      }
    }

    return { product: prod };
  });
