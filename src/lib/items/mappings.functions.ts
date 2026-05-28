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
      supplier_id: z.string().uuid().optional(),
      supplier_tax_id: z.string().min(1).max(32).optional(),
      lines: z.array(LineInput).min(1).max(100),
    }).refine((v) => !!(v.supplier_id || v.supplier_tax_id), {
      message: "Cần supplier_id hoặc supplier_tax_id",
    }).parse(i),
  )
  .handler(async ({ context, data }) => {
    const { supabase, tenantId } = context;
    let supplierId = data.supplier_id ?? null;
    if (!supplierId && data.supplier_tax_id) {
      const { data: sup } = await supabase
        .from("suppliers")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("tax_id", data.supplier_tax_id)
        .maybeSingle();
      supplierId = sup?.id ?? null;
    }
    if (!supplierId) {
      return { supplier_id: null, items: [] as Array<{ line: z.infer<typeof LineInput>; result: ResolveResult }> };
    }
    const out: Array<{ line: z.infer<typeof LineInput>; result: ResolveResult }> = [];
    for (const line of data.lines) {
      const result = await resolveVendorLine(supabase, {
        tenantId,
        supplierId,
        rawName: line.raw_name,
        rawUnit: line.raw_unit ?? null,
        qty: line.qty ?? null,
        price: line.price ?? null,
      });
      out.push({ line, result });
    }
    return { supplier_id: supplierId, items: out };
  });

type VoteEntry = {
  product_id: string | null;
  purpose_code: string | null;
  at: string;
  by: string | null;
};

const VOTE_LOG_MAX = 10;
const CONFLICT_RECENT_DAYS = 30;

/**
 * Append vote, keep last VOTE_LOG_MAX, then compute recency-weighted winner.
 * Trọng số: exp(-Δdays/30) — vote mới ảnh hưởng cao hơn vote cũ.
 */
function rollVoteLog(
  prev: VoteEntry[] | null | undefined,
  entry: VoteEntry,
): { log: VoteEntry[]; winner: { product_id: string | null; purpose_code: string | null } | null } {
  const arr = Array.isArray(prev) ? [...prev] : [];
  arr.push(entry);
  const log = arr.slice(-VOTE_LOG_MAX);
  const now = Date.now();
  const tally = new Map<string, { weight: number; product_id: string | null; purpose_code: string | null }>();
  for (const v of log) {
    const t = new Date(v.at).getTime();
    const days = Math.max(0, (now - t) / 86400000);
    const w = Math.exp(-days / 30);
    const key = `${v.product_id ?? ""}|${v.purpose_code ?? ""}`;
    const cur = tally.get(key);
    if (cur) cur.weight += w;
    else tally.set(key, { weight: w, product_id: v.product_id, purpose_code: v.purpose_code });
  }
  let winner: { product_id: string | null; purpose_code: string | null } | null = null;
  let max = -1;
  for (const v of tally.values()) {
    if (v.weight > max) {
      max = v.weight;
      winner = { product_id: v.product_id, purpose_code: v.purpose_code };
    }
  }
  return { log, winner };
}

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
    const nowIso = new Date().toISOString();

    const { data: existing } = await supabase
      .from("supplier_item_mappings")
      .select("id, match_count, confidence, product_id, vote_log, correction_count")
      .eq("tenant_id", tenantId)
      .eq("supplier_id", data.supplier_id)
      .eq("raw_name_norm", raw_name_norm)
      .maybeSingle();

    if (existing) {
      const prevConf = Number(existing.confidence ?? 0.9);
      const acceptAsIs = existing.product_id === data.product_id;
      const { log, winner } = rollVoteLog(
        existing.vote_log as VoteEntry[] | null,
        { product_id: data.product_id, purpose_code: null, at: nowIso, by: userId ?? null },
      );

      // Phát hiện mâu thuẫn trong cửa sổ gần đây
      const recentCutoff = Date.now() - CONFLICT_RECENT_DAYS * 86400000;
      const recentProducts = new Set(
        log
          .filter((v) => new Date(v.at).getTime() >= recentCutoff && v.product_id)
          .map((v) => v.product_id as string),
      );
      const hasConflict = recentProducts.size >= 2;

      // Confidence policy:
      //  - mâu thuẫn gần đây → 0.7 (dưới ngưỡng auto, đẩy review)
      //  - giữ nguyên → củng cố (+0.05, cap 0.99)
      //  - đổi product (không mâu thuẫn) → reset 0.85
      let nextConfidence: number;
      if (hasConflict) nextConfidence = 0.7;
      else if (acceptAsIs) nextConfidence = Math.min(0.99, prevConf + 0.05);
      else nextConfidence = 0.85;

      const nextCount = acceptAsIs ? (existing.match_count ?? 0) + 1 : 1;
      const nextCorrection = acceptAsIs
        ? Number(existing.correction_count ?? 0)
        : Number(existing.correction_count ?? 0) + 1;
      const winnerMismatch = winner && winner.product_id !== data.product_id;

      const { error } = await supabase
        .from("supplier_item_mappings")
        .update({
          product_id: data.product_id,
          raw_unit: data.raw_unit ?? null,
          unit_conversion_factor: data.unit_conversion_factor,
          confidence: nextConfidence,
          match_count: nextCount,
          correction_count: nextCorrection,
          last_correction_at: acceptAsIs ? null : nowIso,
          last_seen: nowIso,
          source: "user_confirm",
          vote_log: log,
        })
        .eq("id", existing.id);
      if (error) throw new Error(error.message);

      if (!acceptAsIs) {
        await supabase.from("item_resolution_log").insert({
          tenant_id: tenantId,
          supplier_id: data.supplier_id,
          raw_name: data.raw_name,
          raw_unit: data.raw_unit ?? null,
          resolved_product_id: data.product_id,
          method: "user_override",
          score: 1,
          signals: {
            prev_product_id: existing.product_id,
            prev_confidence: prevConf,
            has_conflict: hasConflict,
            winner_mismatch: !!winnerMismatch,
          },
        }).then(({ error: e }: any) => {
          if (e) console.warn("[confirmItemMapping] override log failed", e.message);
        });

        // Negative memory: product cũ bị "soft-reject"
        if (existing.product_id && existing.product_id !== data.product_id) {
          await supabase.from("supplier_item_rejections").upsert(
            {
              tenant_id: tenantId,
              supplier_id: data.supplier_id,
              raw_name_norm,
              rejected_product_id: existing.product_id,
              rejected_purpose_code: null,
              count: 1,
              last_at: nowIso,
            },
            { onConflict: "tenant_id,supplier_id,raw_name_norm,rejected_product_id,rejected_purpose_code" },
          ).then(({ error: e }: any) => {
            if (e) console.warn("[confirmItemMapping] rejection log failed", e.message);
          });
        }
      }
    } else {
      const { error } = await supabase.from("supplier_item_mappings").insert({
        tenant_id: tenantId,
        supplier_id: data.supplier_id,
        product_id: data.product_id,
        raw_name: data.raw_name,
        raw_name_norm,
        raw_unit: data.raw_unit ?? null,
        unit_conversion_factor: data.unit_conversion_factor,
        confidence: 0.9, // sửa tay lần đầu — chưa đủ để auto, cần ≥ 1 lần củng cố
        match_count: 1,
        source: "user_confirm",
        created_by: userId,
        vote_log: [
          { product_id: data.product_id, purpose_code: null, at: nowIso, by: userId ?? null },
        ],
      });
      if (error) throw new Error(error.message);
    }

    const { data: prod } = await supabase
      .from("products")
      .select("id, code, name, unit, item_type, stock_account, expense_account")
      .eq("id", data.product_id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    return { ok: true, product: prod ?? null };
  });

export const listSupplierItemMappings = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i: unknown) =>
    z.object({
      supplier_id: z.string().uuid().optional().nullable(),
      search: z.string().max(255).optional().nullable(),
      limit: z.number().int().min(1).max(500).default(200),
    }).parse(i),
  )
  .handler(async ({ context, data }) => {
    const { supabase, tenantId } = context;
    let q = supabase
      .from("supplier_item_mappings")
      .select(
        "id, supplier_id, raw_name, raw_unit, product_id, unit_conversion_factor, confidence, match_count, last_seen, source, created_at, " +
          "suppliers!supplier_id(name), products!product_id(code, name, unit)",
      )
      .eq("tenant_id", tenantId)
      .order("match_count", { ascending: false })
      .order("last_seen", { ascending: false, nullsFirst: false })
      .limit(data.limit);
    if (data.supplier_id) q = q.eq("supplier_id", data.supplier_id);
    if (data.search) q = q.ilike("raw_name", `%${data.search}%`);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { rows: rows ?? [] };
  });

export const deleteSupplierItemMapping = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ context, data }) => {
    const { supabase, tenantId } = context;
    const { error } = await supabase
      .from("supplier_item_mappings")
      .delete()
      .eq("id", data.id)
      .eq("tenant_id", tenantId);
    if (error) throw new Error(error.message);
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
      unit_conversion_factor: z.number().positive().default(1),
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
      unit_conversion_factor: data.unit_conversion_factor,
      confidence: 0.98,
      match_count: 1,
      source: "user_create",
      created_by: userId,
    });

    return { product_id: prod.id as string };
  });

/** Update which product a mapping rule points to (KTV edit inline). */
export const updateMappingProduct = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i: unknown) =>
    z.object({
      id: z.string().uuid(),
      product_id: z.string().uuid(),
      unit_conversion_factor: z.number().positive().optional(),
    }).parse(i),
  )
  .handler(async ({ context, data }) => {
    const { supabase, tenantId } = context;
    // Lấy bản ghi cũ để biết product_id trước → log user_override khi đổi.
    const { data: prev } = await supabase
      .from("supplier_item_mappings")
      .select("id, supplier_id, product_id, raw_name, raw_unit, confidence")
      .eq("id", data.id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!prev) throw new Error("Không tìm thấy mapping");

    const patch = {
      product_id: data.product_id,
      source: "user_confirm",
      last_seen: new Date().toISOString(),
      ...(data.unit_conversion_factor != null
        ? { unit_conversion_factor: data.unit_conversion_factor }
        : {}),
    };
    const { error } = await supabase
      .from("supplier_item_mappings")
      .update(patch)
      .eq("id", data.id)
      .eq("tenant_id", tenantId);
    if (error) throw new Error(error.message);

    if (prev.product_id && prev.product_id !== data.product_id) {
      await supabase.from("item_resolution_log").insert({
        tenant_id: tenantId,
        supplier_id: prev.supplier_id,
        raw_name: prev.raw_name,
        raw_unit: prev.raw_unit,
        resolved_product_id: data.product_id,
        method: "user_override",
        score: 1,
        signals: { prev_product_id: prev.product_id, prev_confidence: Number(prev.confidence ?? 0) },
      }).then(({ error: e }: any) => {
        if (e) console.warn("[updateMappingProduct] override log failed", e.message);
      });
    }
    return { ok: true };
  });

/** Search products in active tenant catalog (for inline edit combobox). */
export const searchProductsForMapping = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i: unknown) =>
    z.object({
      search: z.string().max(255).optional().nullable(),
      limit: z.number().int().min(1).max(50).default(20),
    }).parse(i),
  )
  .handler(async ({ context, data }) => {
    const { supabase, tenantId } = context;
    let q = supabase
      .from("products")
      .select("id, code, name, unit, item_type, stock_account")
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .order("code")
      .limit(data.limit);
    const s = (data.search ?? "").trim();
    if (s) {
      q = q.or(`code.ilike.%${s}%,name.ilike.%${s}%`);
    }
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { rows: rows ?? [] };
  });

/**
 * Detect raw_name strings that have been mapped to ≥2 different product_ids
 * across this tenant (possibly different suppliers) — likely confusion.
 */
export const listMappingConflicts = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i: unknown) =>
    z.object({ limit: z.number().int().min(1).max(100).default(50) }).parse(i ?? {}),
  )
  .handler(async ({ context, data }) => {
    const { supabase, tenantId } = context;
    const { data: rows, error } = await supabase
      .from("supplier_item_mappings")
      .select(
        "id, raw_name, raw_name_norm, supplier_id, product_id, match_count, " +
          "suppliers!supplier_id(name), products!product_id(code, name, unit)",
      )
      .eq("tenant_id", tenantId)
      .limit(2000);
    if (error) throw new Error(error.message);

    const groups = new Map<string, any[]>();
    for (const r of (rows ?? []) as any[]) {
      const k = r.raw_name_norm || "";
      if (!k) continue;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push(r);
    }
    const conflicts: Array<{
      raw_name_norm: string;
      sample_raw_name: string;
      entries: any[];
    }> = [];
    for (const [k, entries] of groups) {
      const distinct = new Set(entries.map((e) => e.product_id));
      if (distinct.size >= 2) {
        conflicts.push({ raw_name_norm: k, sample_raw_name: entries[0].raw_name, entries });
      }
    }
    conflicts.sort(
      (a, b) =>
        b.entries.reduce((s, e) => s + (e.match_count ?? 0), 0) -
        a.entries.reduce((s, e) => s + (e.match_count ?? 0), 0),
    );
    return { conflicts: conflicts.slice(0, data.limit) };
  });

/**
 * Bulk import vendor→product mapping rules from CSV/paste.
 * Each row: supplier (name or tax_id), product (code), raw_name, [raw_unit], [factor].
 * Skips rows where supplier or product can't be resolved and reports them back.
 */
const BulkRowInput = z.object({
  supplier_ref: z.string().min(1).max(200), // name OR tax_id
  product_code: z.string().min(1).max(64),
  raw_name: z.string().min(1).max(500),
  raw_unit: z.string().max(64).optional().nullable(),
  unit_conversion_factor: z.number().positive().optional(),
});

export const bulkImportMappings = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i: unknown) =>
    z.object({ rows: z.array(BulkRowInput).min(1).max(1000) }).parse(i),
  )
  .handler(async ({ context, data }) => {
    const { supabase, tenantId, userId } = context;

    // Pre-load tenant suppliers + products to resolve refs locally.
    const [{ data: suppliers }, { data: products }] = await Promise.all([
      supabase
        .from("suppliers")
        .select("id, name, tax_id")
        .eq("tenant_id", tenantId)
        .limit(5000),
      supabase
        .from("products")
        .select("id, code")
        .eq("tenant_id", tenantId)
        .limit(5000),
    ]);

    const supByTax = new Map<string, string>();
    const supByName = new Map<string, string>();
    for (const s of (suppliers ?? []) as any[]) {
      if (s.tax_id) supByTax.set(String(s.tax_id).trim(), s.id);
      if (s.name) supByName.set(normalizeName(s.name), s.id);
    }
    const prodByCode = new Map<string, string>();
    for (const p of (products ?? []) as any[]) {
      if (p.code) prodByCode.set(String(p.code).trim().toLowerCase(), p.id);
    }

    const errors: Array<{ row: number; reason: string }> = [];
    const inserts: any[] = [];
    let inserted = 0;
    let updated = 0;

    for (let i = 0; i < data.rows.length; i++) {
      const r = data.rows[i];
      const refTrim = r.supplier_ref.trim();
      const supplierId =
        supByTax.get(refTrim) ?? supByName.get(normalizeName(refTrim)) ?? null;
      if (!supplierId) {
        errors.push({ row: i + 1, reason: `Không tìm thấy NCC "${r.supplier_ref}"` });
        continue;
      }
      const productId = prodByCode.get(r.product_code.trim().toLowerCase()) ?? null;
      if (!productId) {
        errors.push({ row: i + 1, reason: `Không tìm thấy mã hệ thống "${r.product_code}"` });
        continue;
      }
      const raw_name_norm = normalizeName(r.raw_name);
      if (!raw_name_norm) {
        errors.push({ row: i + 1, reason: "raw_name rỗng" });
        continue;
      }

      // Upsert: check existence
      const { data: existing } = await supabase
        .from("supplier_item_mappings")
        .select("id, match_count")
        .eq("tenant_id", tenantId)
        .eq("supplier_id", supplierId)
        .eq("raw_name_norm", raw_name_norm)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from("supplier_item_mappings")
          .update({
            product_id: productId,
            raw_unit: r.raw_unit ?? null,
            unit_conversion_factor: r.unit_conversion_factor ?? 1,
            confidence: 0.98,
            source: "imported",
            last_seen: new Date().toISOString(),
          })
          .eq("id", existing.id);
        if (error) errors.push({ row: i + 1, reason: error.message });
        else updated++;
      } else {
        inserts.push({
          tenant_id: tenantId,
          supplier_id: supplierId,
          product_id: productId,
          raw_name: r.raw_name,
          raw_name_norm,
          raw_unit: r.raw_unit ?? null,
          unit_conversion_factor: r.unit_conversion_factor ?? 1,
          confidence: 0.98,
          match_count: 1,
          source: "imported",
          created_by: userId,
        });
      }
    }

    if (inserts.length > 0) {
      const { error } = await supabase.from("supplier_item_mappings").insert(inserts);
      if (error) {
        errors.push({ row: 0, reason: `Insert lỗi: ${error.message}` });
      } else {
        inserted = inserts.length;
      }
    }

    return {
      inserted,
      updated,
      errors,
      total: data.rows.length,
    };
  });
