// Server-only: vector embedding helpers for item resolution Layer 2.5.
// Uses Lovable AI Gateway → google/gemini-embedding-001 truncated to 768 dims.

const EMBED_MODEL = "google/gemini-embedding-001";
const EMBED_DIMS = 768;
const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/embeddings";

export type EmbedResult = {
  embedding: number[];
  model: string;
};

/**
 * Embed a single piece of text. Returns null if API key missing or call fails —
 * caller must fall back gracefully (vector layer is enrichment, not required).
 */
export async function embedText(text: string): Promise<EmbedResult | null> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) return null;
  const trimmed = text.trim().slice(0, 8000);
  if (!trimmed) return null;
  try {
    const res = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: EMBED_MODEL,
        input: trimmed,
        dimensions: EMBED_DIMS,
      }),
    });
    if (!res.ok) {
      console.warn("[embeddings] non-OK", res.status);
      return null;
    }
    const json = (await res.json()) as { data?: Array<{ embedding: number[] }> };
    const v = json.data?.[0]?.embedding;
    if (!Array.isArray(v) || v.length !== EMBED_DIMS) return null;
    return { embedding: v, model: EMBED_MODEL };
  } catch (e) {
    console.warn("[embeddings] fetch failed", e);
    return null;
  }
}

/**
 * Ensure a product has an embedding in product_embeddings. Idempotent —
 * skips if already present and source_text unchanged.
 */
export async function ensureProductEmbedding(
  supabase: any,
  tenantId: string,
  product: { id: string; code: string; name: string; aliases?: string[] | null },
): Promise<boolean> {
  const sourceText = [product.code, product.name, ...(product.aliases ?? [])]
    .filter(Boolean)
    .join(" · ");
  const { data: existing } = await supabase
    .from("product_embeddings")
    .select("source_text")
    .eq("product_id", product.id)
    .maybeSingle();
  if (existing && existing.source_text === sourceText) return true;

  const r = await embedText(sourceText);
  if (!r) return false;
  const { error } = await supabase.from("product_embeddings").upsert({
    product_id: product.id,
    tenant_id: tenantId,
    source_text: sourceText,
    embedding: r.embedding,
    model: r.model,
    updated_at: new Date().toISOString(),
  });
  if (error) {
    console.warn("[embeddings] upsert product failed", error.message);
    return false;
  }
  return true;
}

/**
 * Find top-K products in tenant by semantic similarity to a raw vendor line name.
 * Caches the query embedding in vendor_raw_embeddings (keyed by raw_name_norm).
 */
export async function semanticSearchProducts(
  supabase: any,
  tenantId: string,
  rawNameNorm: string,
  limit = 5,
): Promise<Array<{ product_id: string; similarity: number }>> {
  if (!rawNameNorm) return [];

  // Try cache
  const { data: cached } = await supabase
    .from("vendor_raw_embeddings")
    .select("embedding")
    .eq("tenant_id", tenantId)
    .eq("raw_name_norm", rawNameNorm)
    .maybeSingle();

  let vec: number[] | null = cached?.embedding ?? null;
  if (!vec) {
    const r = await embedText(rawNameNorm);
    if (!r) return [];
    vec = r.embedding;
    // Best-effort cache
    await supabase
      .from("vendor_raw_embeddings")
      .upsert({
        tenant_id: tenantId,
        raw_name_norm: rawNameNorm,
        embedding: vec,
        updated_at: new Date().toISOString(),
      })
      .then((res: any) => {
        if (res.error) console.warn("[embeddings] cache failed", res.error.message);
      });
  }

  const { data, error } = await supabase.rpc("match_products_for_vendor", {
    p_tenant_id: tenantId,
    p_query_embedding: vec,
    p_limit: limit,
  });
  if (error) {
    console.warn("[embeddings] rpc failed", error.message);
    return [];
  }
  return (data ?? []) as Array<{ product_id: string; similarity: number }>;
}
