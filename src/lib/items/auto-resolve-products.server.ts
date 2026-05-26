/**
 * Auto-resolve goods lines to products: match by code/name; if missing,
 * auto-create a product in the tenant catalog so that stock vouchers can
 * be generated without forcing users to manually pick each item.
 */

type AnyLine = Record<string, any>;

async function genProductCode(
  supabase: any,
  tenantId: string,
  hintName: string,
): Promise<string> {
  // Slug từ tên + suffix theo timestamp đảm bảo unique trong tenant.
  const slug = (hintName || "HH")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "")
    .slice(0, 8) || "HH";
  for (let i = 0; i < 5; i++) {
    const candidate = `${slug}-${Date.now().toString(36).toUpperCase().slice(-5)}${i || ""}`;
    const { data } = await supabase
      .from("products")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("code", candidate)
      .maybeSingle();
    if (!data) return candidate;
  }
  return `HH-${Date.now()}`;
}

export async function resolveStockLineProducts(
  supabase: any,
  tenantId: string,
  userId: string,
  lines: AnyLine[] | undefined | null,
): Promise<AnyLine[]> {
  if (!Array.isArray(lines) || lines.length === 0) return lines ?? [];
  const out = lines.map((l) => ({ ...l }));

  for (let i = 0; i < out.length; i++) {
    const l = out[i];
    if (l.line_type && l.line_type !== "goods") continue;
    if (l.product_id) continue;
    const code = String(l.product_code ?? "").trim();
    const name = String(l.product_name ?? "").trim();
    if (!code && !name) continue;

    let productId: string | null = null;

    if (code) {
      const { data } = await supabase
        .from("products")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("code", code)
        .maybeSingle();
      if (data?.id) productId = data.id;
    }

    if (!productId && name) {
      const { data } = await supabase
        .from("products")
        .select("id")
        .eq("tenant_id", tenantId)
        .ilike("name", name)
        .limit(1)
        .maybeSingle();
      if (data?.id) productId = data.id;
    }

    if (!productId && (name || code)) {
      const newCode = code || (await genProductCode(supabase, tenantId, name));
      const { data: prod, error } = await supabase
        .from("products")
        .insert({
          tenant_id: tenantId,
          user_id: userId,
          code: newCode,
          name: name || newCode,
          unit: l.unit || "cái",
          item_type: "goods",
          stock_account: "156",
          unit_price: Number(l.unit_price || 0),
          unit_cost: Number(l.unit_price || 0),
          is_active: true,
        })
        .select("id")
        .single();
      if (!error && prod?.id) productId = prod.id;
    }

    if (productId) out[i] = { ...l, product_id: productId };
  }

  return out;
}
