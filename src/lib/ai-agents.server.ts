import { assertTenantMember } from "@/lib/auth/active-tenant.server";
/**
 * Server-only helper to log AI agent activity from inside other server functions
 * (e.g. parseDocument, classify pipelines). Non-fatal: swallows all errors so a
 * logging failure never breaks the caller.
 */
export async function tryLogAgentActivity(
  supabase: any,
  userId: string,
  params: {
    agent_id: "extract" | "categorize" | "reconcile" | "tax" | "alert" | "report";
    action: string;
    result?: "success" | "warning" | "error";
    duration_ms?: number;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  try {
    const { data: prof } = await supabase
      .from("profiles")
      .select("active_tenant_id")
      .eq("id", userId)
      .maybeSingle();
    const tenantId = prof?.active_tenant_id;
    if (tenantId) await assertTenantMember(supabase, userId, tenantId);
    if (!tenantId) return;
    await supabase.from("ai_agent_activity_logs").insert({
      tenant_id: tenantId,
      agent_id: params.agent_id,
      action: params.action.slice(0, 500),
      result: params.result ?? "success",
      duration_ms: params.duration_ms ?? null,
      metadata: (params.metadata ?? null) as never,
    });
  } catch (e) {
    console.warn("[agent-activity] log failed:", (e as Error)?.message);
  }
}
