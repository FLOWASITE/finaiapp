/**
 * Server function wrapper for the auto-promote scanner. Allows admins to
 * trigger a scan for their own tenant from the UI.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { scanAndPromoteRules } from "./promote-rules.server";

async function activeTenant(supabase: any, userId: string): Promise<string | null> {
  const { data } = await supabase
    .from("profiles")
    .select("active_tenant_id")
    .eq("id", userId)
    .maybeSingle();
  return data?.active_tenant_id ?? null;
}

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
