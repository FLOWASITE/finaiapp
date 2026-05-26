import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveActiveTenantId } from "@/lib/auth/active-tenant.server";
import { ensureProductEmbedding } from "@/lib/items/embeddings.server";

/**
 * Backfill embeddings for all active products of the current tenant.
 * Skips products whose source_text is unchanged. Returns counts.
 */
export const backfillProductEmbeddings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { limit?: number } | undefined) => i ?? {})
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const tenantId = await resolveActiveTenantId(supabase, userId);
    if (!tenantId) throw new Error("Chưa chọn doanh nghiệp hoạt động");
    const limit = Math.min(Math.max(Number(data.limit) || 200, 1), 500);

    const { data: products, error } = await supabase
      .from("products")
      .select("id, code, name")
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .order("code")
      .limit(limit);
    if (error) throw new Error(error.message);

    let ok = 0;
    let failed = 0;
    for (const p of products ?? []) {
      const success = await ensureProductEmbedding(supabase, tenantId, {
        id: p.id,
        code: p.code,
        name: p.name,
        aliases: null,
      });
      if (success) ok++;
      else failed++;
    }
    return { total: products?.length ?? 0, ok, failed };
  });
