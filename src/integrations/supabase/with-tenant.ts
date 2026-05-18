import { createMiddleware } from "@tanstack/react-start";
import { requireSupabaseAuth } from "./auth-middleware";

/**
 * Extends `requireSupabaseAuth` with the user's active tenant.
 *
 * Provides in context:
 *  - supabase, userId, claims (from requireSupabaseAuth)
 *  - tenantId: profiles.active_tenant_id (string)
 *
 * Throws "Chưa chọn doanh nghiệp hoạt động" if the user has no active tenant.
 */
export const withTenant = createMiddleware({ type: "function" })
  .middleware([requireSupabaseAuth])
  .server(async ({ next, context }) => {
    const { data, error } = await context.supabase
      .from("profiles")
      .select("active_tenant_id")
      .eq("id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const tenantId = data?.active_tenant_id;
    if (!tenantId) {
      throw new Error("Chưa chọn doanh nghiệp hoạt động");
    }
    return next({ context: { tenantId } });
  });
