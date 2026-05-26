/**
 * Server function wrapper for the auto-promote scanner. Allows admins to
 * trigger a scan for their own tenant from the UI.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveActiveTenantId } from "@/lib/auth/active-tenant.server";
import { scanAndPromoteRules } from "./promote-rules.server";

const activeTenant = (supabase: any, userId: string) =>
  resolveActiveTenantId(supabase, userId);

export const runPromoteRulesForTenant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;
    const tenantId = await activeTenant(supabase, userId);
    if (!tenantId) throw new Error("Chưa chọn doanh nghiệp");
    const result = await scanAndPromoteRules(supabase, tenantId);
    try {
      const { invalidateCategorizeCache } = await import("@/lib/categorize/cache.server");
      invalidateCategorizeCache(tenantId);
    } catch {}
    return result;
  });
