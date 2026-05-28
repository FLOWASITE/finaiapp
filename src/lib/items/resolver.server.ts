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
  // If suggested from global catalog library (not yet in Mục của tôi)
  fromLibrary?: {
    catalog_id: string;
    category: string | null;
    subcategory: string | null;
    default_account: string | null;
    vat_rate: number | null;
    item_type: string | null;
  };
};

export type ResolveResult = {
  method: "cache" | "fuzzy" | "library" | "none";
  status: "auto" | "review" | "new" | "library_suggestion";
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

  // Load negative memory (rejections) up-front — applies to both Layer 1 and Layer 2.
  const { data: rejRows } = await supabase
    .from("supplier_item_rejections")
    .select("rejected_product_id, count")
    .eq("tenant_id", input.tenantId)
    .eq("supplier_id", input.supplierId)
    .eq("raw_name_norm", rawNorm);
  const rejectedProductIds = new Set<string>(
    (rejRows ?? [])
      .filter((r: any) => Number(r.count ?? 0) >= 2 && r.rejected_product_id)
      .map((r: any) => r.rejected_product_id as string),
  );

  // ---- Layer 1: cached mapping (skip archived & rejected) ----
  const { data: cached } = await supabase
    .from("supplier_item_mappings")
    .select("*, products!inner(id, code, name, unit, item_type, stock_account, expense_account, unit_cost, aliases)")
    .eq("tenant_id", input.tenantId)
    .eq("supplier_id", input.supplierId)
    .eq("raw_name_norm", rawNorm)
    .is("archived_at", null)
    .maybeSingle();

  const cConf = Number(cached?.confidence ?? 0);
  const cCount = Number(cached?.match_count ?? 0);
  const cacheAutoOk =
    cached?.products &&
    !rejectedProductIds.has(cached.products.id) &&
    ((cConf >= 0.95 && cCount >= 1) || (cConf >= 0.9 && cCount >= 3));
  if (cacheAutoOk) {
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
      score: cConf,
      signals: { text: 1, unit: 1, price: 1, history: 1, sku: 0 },
      cached: {
        match_count: cCount,
        confidence: cConf,
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

  // ---- Layer 2.5: semantic search via pgvector (best-effort, no-op if no key) ----
  try {
    const semantic = await semanticSearchProducts(supabase, input.tenantId, rawNorm, 5);
    const semanticIds = new Set(semantic.map((s) => s.product_id));
    const knownIds = new Set(candidateProducts.map((p) => p.id));
    const missing = [...semanticIds].filter((id) => !knownIds.has(id));
    if (missing.length > 0) {
      const { data: extras } = await supabase
        .from("products")
        .select("id, code, name, unit, item_type, stock_account, expense_account, unit_cost, aliases")
        .eq("tenant_id", input.tenantId)
        .in("id", missing);
      if (extras) candidateProducts.push(...extras);
    }
    // Stash similarity for use in scoring (boosts text signal a bit).
    (candidateProducts as any).__semantic = new Map(
      semantic.map((s) => [s.product_id, s.similarity]),
    );
  } catch {
    // Vector layer is enrichment; never block the resolve.
  }


  const semanticMap: Map<string, number> = (candidateProducts as any).__semantic ?? new Map();
  const scored: Candidate[] = candidateProducts.map((p) => {
    const aliasBest = (p.aliases ?? []).reduce(
      (m: number, al: string) => Math.max(m, textSim(rawNorm, al)),
      0,
    );
    const sem = semanticMap.get(p.id) ?? 0;
    const text = Math.max(textSim(rawNorm, p.name), aliasBest, sem * 0.95);
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

  // Filter out rejected products (negative memory) before sorting.
  const scoredFiltered = scored.filter((c) => !rejectedProductIds.has(c.product_id));
  scoredFiltered.sort((a, b) => b.score - a.score);
  const top = scoredFiltered.slice(0, 3).filter((c) => c.score > 0);

  const fuzzyBest = top[0];
  // Layer 2 fuzzy gives an auto/review result only when we have a strong match.
  if (fuzzyBest && fuzzyBest.score >= 0.7) {
    const status: ResolveResult["status"] = fuzzyBest.score >= 0.9 ? "auto" : "review";
    await logResolution(supabase, input, fuzzyBest.product_id, "fuzzy", fuzzyBest.score, fuzzyBest.signals);
    return { method: "fuzzy", status, best: fuzzyBest, candidates: top };
  }

  // ---- Layer 2.5: fallback to global library (tenant_product_catalog) ----
  const libraryCandidates = await searchLibrary(supabase, input.tenantId, rawNorm, input.rawUnit ?? null);
  if (libraryCandidates.length > 0) {
    const best = libraryCandidates[0];
    await logResolution(supabase, input, null, "library", best.score, best.signals);
    return {
      method: "library",
      status: "library_suggestion",
      best,
      candidates: libraryCandidates,
    };
  }

  // If fuzzy gave something weak (score < 0.7) and library was empty, still surface those.
  if (top.length > 0) {
    await logResolution(supabase, input, null, "fuzzy", fuzzyBest!.score, fuzzyBest!.signals);
    return { method: "fuzzy", status: "new", candidates: top };
  }

  await logResolution(supabase, input, null, "none", 0, {});
  return { method: "none", status: "new", candidates: [] };
}

async function searchLibrary(
  supabase: any,
  tenantId: string,
  rawNorm: string,
  rawUnit: string | null,
): Promise<Candidate[]> {
  if (!rawNorm) return [];
  const firstTokens = rawNorm.split(" ").slice(0, 2).join("%");
  const ilike = `%${firstTokens}%`;
  // Pull global library + this tenant's own catalog rows.
  const { data: rows } = await supabase
    .from("tenant_product_catalog")
    .select("id, name, name_norm, aliases, category, subcategory, item_type, default_account, vat_rate")
    .or(`is_global.eq.true,tenant_id.eq.${tenantId}`)
    .or(`name.ilike.${ilike},name_norm.ilike.${ilike}`)
    .limit(80);

  const list = (rows ?? []) as any[];
  if (list.length === 0) return [];

  const scored = list.map((r) => {
    const aliasBest = (r.aliases ?? []).reduce(
      (m: number, al: string) => Math.max(m, textSim(rawNorm, al)),
      0,
    );
    const text = Math.max(textSim(rawNorm, r.name_norm || r.name), aliasBest);
    // No real unit on library rows yet → neutral.
    const unit = rawUnit ? 0.5 : 0.5;
    const fallbackAcct = inferStockAccount(r.default_account, r.item_type);
    return {
      product_id: "", // not yet in `products`
      code: "",
      name: r.name as string,
      unit: rawUnit ?? "",
      item_type: (r.item_type as string) ?? "goods",
      stock_account: fallbackAcct.stock,
      expense_account: fallbackAcct.expense,
      unit_cost: 0,
      aliases: r.aliases ?? [],
      score: text * 0.85 + unit * 0.15,
      signals: { text, unit, price: 0, history: 0, sku: 0 },
      fromLibrary: {
        catalog_id: r.id as string,
        category: r.category ?? null,
        subcategory: r.subcategory ?? null,
        default_account: r.default_account ?? null,
        vat_rate: r.vat_rate != null ? Number(r.vat_rate) : null,
        item_type: r.item_type ?? null,
      },
    } as Candidate;
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.filter((c) => c.score >= 0.45).slice(0, 3);
}

function inferStockAccount(
  defaultAccount: string | null | undefined,
  itemType: string | null | undefined,
): { stock: string | null; expense: string | null } {
  const acct = (defaultAccount ?? "").trim();
  // Stock-like accounts → put on stock_account
  if (["152", "153", "156", "211", "213"].includes(acct)) {
    return { stock: acct, expense: null };
  }
  // Expense / prepaid → expense_account
  if (acct.startsWith("6") || acct === "242") {
    return { stock: null, expense: acct };
  }
  // Fallback by item_type
  if (itemType === "service") return { stock: null, expense: "642" };
  return { stock: "156", expense: null };
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
