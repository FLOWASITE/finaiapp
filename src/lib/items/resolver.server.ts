// Server-only resolver: maps a vendor invoice line → master product code.
// 4-layer architecture: cache → multi-signal fuzzy (+ semantic boost) → (LLM, off by default) → human.

import { normalizeName, textSim } from "./normalize";
import { semanticSearchProducts } from "./embeddings.server";

export type ResolveInput = {
  rawName: string;
  rawUnit?: string | null;
  qty?: number | null;
  price?: number | null;
  supplierId: string;
  tenantId: string;
};

export type Candidate = {
  product_id: string;
  code: string;
  name: string;
  unit: string;
  item_type: string;
  stock_account: string | null;
  expense_account: string | null;
  unit_cost: number;
  aliases?: string[];
  // Scoring detail
  score: number;
  signals: {
    text: number;
    unit: number;
    price: number;
    history: number;
    sku: number;
  };
  // If from cache
  cached?: {
    match_count: number;
    confidence: number;
    unit_factor: number;
  };
};

export type ResolveResult = {
  method: "cache" | "fuzzy" | "none";
  status: "auto" | "review" | "new";
  best?: Candidate;
  candidates: Candidate[];
};

const W = { text: 0.55, unit: 0.2, price: 0.1, history: 0.1, sku: 0.05 };

function isCompatibleUnit(a?: string | null, b?: string | null): number {
  if (!a || !b) return 0.5; // unknown → neutral
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (na === nb) return 1;
  // crude compatibility groups
  const groups: string[][] = [
    ["cai", "chiec", "cay", "bo", "doi", "cap"],
    ["kg", "g", "mg", "tan", "ta", "yen", "gram", "gam"],
    ["lit", "ml", "m3"],
    ["m", "cm", "mm", "km", "m2"],
    ["ream", "thung", "hop", "goi", "tui", "bao", "kien", "cuon", "to", "quyen", "tap", "vi", "khay"],
    ["gio", "phut", "ngay", "tuan", "thang", "nam", "lan", "suat", "phan", "buoi"],
  ];
  for (const g of groups) if (g.includes(na) && g.includes(nb)) return 0.7;
  // explicitly incompatible (kg vs cai): hard penalty
  return 0;
}

function priceScore(invoicePrice: number | null | undefined, refCost: number): number {
  if (!invoicePrice || !refCost) return 0.5;
  const ratio = invoicePrice / refCost;
  if (ratio >= 0.7 && ratio <= 1.3) return 1;
  if (ratio >= 0.5 && ratio <= 2) return 0.5;
  return 0;
}

function skuScore(rawNorm: string, code: string): number {
  if (!code) return 0;
  const c = normalizeName(code);
  if (!c) return 0;
  return rawNorm.includes(c) ? 1 : 0;
}

export async function resolveVendorLine(
  supabase: any,
  input: ResolveInput,
): Promise<ResolveResult> {
  const rawNorm = normalizeName(input.rawName);
  if (!rawNorm) return { method: "none", status: "new", candidates: [] };

  // ---- Layer 1: cached mapping ----
  const { data: cached } = await supabase
    .from("supplier_item_mappings")
    .select("*, products!inner(id, code, name, unit, item_type, stock_account, expense_account, unit_cost, aliases)")
    .eq("tenant_id", input.tenantId)
    .eq("supplier_id", input.supplierId)
    .eq("raw_name_norm", rawNorm)
    .maybeSingle();

  if (cached?.products && cached.confidence >= 0.9 && cached.match_count >= 3) {
    const p = cached.products;
    const cand: Candidate = {
      product_id: p.id,
      code: p.code,
      name: p.name,
      unit: p.unit,
      item_type: p.item_type,
      stock_account: p.stock_account,
      expense_account: p.expense_account,
      unit_cost: Number(p.unit_cost ?? 0),
      aliases: p.aliases ?? [],
      score: Number(cached.confidence),
      signals: { text: 1, unit: 1, price: 1, history: 1, sku: 0 },
      cached: {
        match_count: cached.match_count,
        confidence: Number(cached.confidence),
        unit_factor: Number(cached.unit_conversion_factor ?? 1),
      },
    };
    return { method: "cache", status: "auto", best: cand, candidates: [cand] };
  }

  // ---- Layer 2: fuzzy multi-signal ----
  // Pull candidate products: prefer those this supplier has supplied before; also broad ILIKE
  const supplierHistoryQ = supabase
    .from("supplier_item_mappings")
    .select("product_id")
    .eq("tenant_id", input.tenantId)
    .eq("supplier_id", input.supplierId)
    .limit(200);

  const ilikeQ = supabase
    .from("products")
    .select("id, code, name, unit, item_type, stock_account, expense_account, unit_cost, aliases")
    .eq("tenant_id", input.tenantId)
    .eq("is_active", true)
    .ilike("name", `%${rawNorm.split(" ").slice(0, 2).join("%")}%`)
    .limit(80);

  const [{ data: historyRows }, { data: ilikeRows }] = await Promise.all([
    supplierHistoryQ,
    ilikeQ,
  ]);

  const historyIds = new Set<string>((historyRows ?? []).map((r: any) => r.product_id));
  let candidateProducts: any[] = ilikeRows ?? [];

  // If too few candidates, broaden the pool with active products from this tenant.
  if (candidateProducts.length < 5) {
    const { data: extra } = await supabase
      .from("products")
      .select("id, code, name, unit, item_type, stock_account, expense_account, unit_cost, aliases")
      .eq("tenant_id", input.tenantId)
      .eq("is_active", true)
      .limit(200);
    if (extra) {
      const seen = new Set(candidateProducts.map((p) => p.id));
      for (const p of extra) if (!seen.has(p.id)) candidateProducts.push(p);
    }
  }

  const scored: Candidate[] = candidateProducts.map((p) => {
    const aliasBest = (p.aliases ?? []).reduce(
      (m: number, al: string) => Math.max(m, textSim(rawNorm, al)),
      0,
    );
    const text = Math.max(textSim(rawNorm, p.name), aliasBest);
    const unit = isCompatibleUnit(input.rawUnit, p.unit);
    const price = priceScore(input.price ?? null, Number(p.unit_cost ?? 0));
    const history = historyIds.has(p.id) ? 1 : 0;
    const sku = skuScore(rawNorm, p.code);
    // Hard reject when units clearly conflict
    if (unit === 0 && (input.rawUnit && p.unit)) {
      return {
        product_id: p.id,
        code: p.code,
        name: p.name,
        unit: p.unit,
        item_type: p.item_type,
        stock_account: p.stock_account,
        expense_account: p.expense_account,
        unit_cost: Number(p.unit_cost ?? 0),
        aliases: p.aliases ?? [],
        score: 0,
        signals: { text, unit, price, history, sku },
      };
    }
    const score =
      W.text * text + W.unit * unit + W.price * price + W.history * history + W.sku * sku;
    return {
      product_id: p.id,
      code: p.code,
      name: p.name,
      unit: p.unit,
      item_type: p.item_type,
      stock_account: p.stock_account,
      expense_account: p.expense_account,
      unit_cost: Number(p.unit_cost ?? 0),
      aliases: p.aliases ?? [],
      score,
      signals: { text, unit, price, history, sku },
    };
  });

  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, 3).filter((c) => c.score > 0);

  if (top.length === 0) {
    await logResolution(supabase, input, null, "none", 0, {});
    return { method: "none", status: "new", candidates: [] };
  }

  const best = top[0];
  const status: ResolveResult["status"] =
    best.score >= 0.9 ? "auto" : best.score >= 0.7 ? "review" : "new";

  await logResolution(supabase, input, status === "new" ? null : best.product_id, "fuzzy", best.score, best.signals);

  return { method: "fuzzy", status, best, candidates: top };
}

async function logResolution(
  supabase: any,
  input: ResolveInput,
  productId: string | null,
  method: string,
  score: number,
  signals: any,
) {
  try {
    await supabase.from("item_resolution_log").insert({
      tenant_id: input.tenantId,
      supplier_id: input.supplierId,
      raw_name: input.rawName,
      raw_unit: input.rawUnit ?? null,
      qty: input.qty ?? null,
      price: input.price ?? null,
      resolved_product_id: productId,
      method,
      score,
      signals,
    });
  } catch (e) {
    // Audit log failure must not break the resolve flow.
    console.error("item_resolution_log insert failed", e);
  }
}
