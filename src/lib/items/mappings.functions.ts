// Server functions: resolve vendor lines, confirm mappings, create new product.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { withTenant } from "@/integrations/supabase/with-tenant";
import { normalizeName } from "./normalize";
import { resolveVendorLine, type ResolveResult } from "./resolver.server";

const LineInput = z.object({
  invoice_line_id: z.string().uuid().optional().nullable(),
  raw_name: z.string().min(1).max(500),
  raw_unit: z.string().max(64).optional().nullable(),
  qty: z.number().optional().nullable(),
  price: z.number().optional().nullable(),
});

export const resolveInvoiceLines = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i: unknown) =>
    z.object({
      supplier_id: z.string().uuid(),
      lines: z.array(LineInput).min(1).max(100),
    }).parse(i),
  )
  .handler(async ({ context, data }) => {
    const { supabase, tenantId } = context;
    const out: Array<{ line: z.infer<typeof LineInput>; result: ResolveResult }> = [];
    for (const line of data.lines) {
      const result = await resolveVendorLine(supabase, {
        tenantId,
        supplierId: data.supplier_id,
        rawName: line.raw_name,
        rawUnit: line.raw_unit ?? null,
        qty: line.qty ?? null,
        price: line.price ?? null,
      });
      out.push({ line, result });
    }
    return { items: out };
  });

export const confirmItemMapping = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i: unknown) =>
    z.object({
      supplier_id: z.string().uuid(),
      product_id: z.string().uuid(),
      raw_name: z.string().min(1).max(500),
      raw_unit: z.string().max(64).optional().nullable(),
      unit_conversion_factor: z.number().positive().default(1),
    }).parse(i),
  )
  .handler(async ({ context, data }) => {
    const { supabase, tenantId, userId } = context;
    const raw_name_norm = normalizeName(data.raw_name);

    // Try update first; if no row, insert.
    const { data: existing } = await supabase
      .from("supplier_item_mappings")
      .select("id, match_count")
      .eq("tenant_id", tenantId)
      .eq("supplier_id", data.supplier_id)
      .eq("raw_name_norm", raw_name_norm)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase
        .from("supplier_item_mappings")
        .update({
          product_id: data.product_id,
          raw_unit: data.raw_unit ?? null,
          unit_conversion_factor: data.unit_conversion_factor,
          confidence: 0.98,
          match_count: (existing.match_count ?? 0) + 1,
          last_seen: new Date().toISOString(),
          source: "user_confirm",
        })
        .eq("id", existing.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase.from("supplier_item_mappings").insert({
        tenant_id: tenantId,
        supplier_id: data.supplier_id,
        product_id: data.product_id,
        raw_name: data.raw_name,
        raw_name_norm,
        raw_unit: data.raw_unit ?? null,
        unit_conversion_factor: data.unit_conversion_factor,
        confidence: 0.98,
        match_count: 1,
        source: "user_confirm",
        created_by: userId,
      });
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

const ItemType = z.enum(["goods", "service", "combo"]);

export const createProductFromRaw = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i: unknown) =>
    z.object({
      supplier_id: z.string().uuid(),
      raw_name: z.string().min(1).max(500),
      raw_unit: z.string().max(64).optional().nullable(),
      code: z.string().min(1).max(64),
      name: z.string().min(1).max(255),
      unit: z.string().min(1).max(64),
      item_type: ItemType.default("goods"),
      stock_account: z.string().max(20).default("156"),
      unit_price: z.number().nonnegative().default(0),
    }).parse(i),
  )
  .handler(async ({ context, data }) => {
    const { supabase, tenantId, userId } = context;
    const { data: prod, error } = await supabase
      .from("products")
      .insert({
        tenant_id: tenantId,
        user_id: userId,
        code: data.code,
        name: data.name,
        unit: data.unit,
        item_type: data.item_type,
        stock_account: data.stock_account,
        unit_price: data.unit_price,
        unit_cost: data.unit_price,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    const raw_name_norm = normalizeName(data.raw_name);
    await supabase.from("supplier_item_mappings").insert({
      tenant_id: tenantId,
      supplier_id: data.supplier_id,
      product_id: prod.id,
      raw_name: data.raw_name,
      raw_name_norm,
      raw_unit: data.raw_unit ?? null,
      unit_conversion_factor: 1,
      confidence: 0.98,
      match_count: 1,
      source: "user_create",
      created_by: userId,
    });

    return { product_id: prod.id as string };
  });
