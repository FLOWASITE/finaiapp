import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { withTenant } from "@/integrations/supabase/with-tenant";
import type { AgentActivity, AgentSettings, AgentStatus } from "@/types/agent";

export type AgentOverride = {
  agent_id: string;
  settings: AgentSettings;
  status: AgentStatus;
  status_message: string | null;
  stats: {
    tasks_today: number;
    tasks_total: number;
    success_rate: number;
    avg_duration_ms: number;
    last_run: string | null;
  };
  recent_activity: AgentActivity[];
};

const settingsSchema = z.object({
  enabled: z.boolean(),
  mode: z.enum(["auto", "suggest", "learn_only", "disabled"]),
  confidence_threshold: z.number().min(0).max(1),
  confidence_profile: z.enum(["strict", "balanced", "flexible"]),
  custom_instructions: z.string().max(2000).optional(),
  notify_on: z.object({
    error: z.boolean(),
    warning: z.boolean(),
    completion: z.boolean(),
  }),
  schedule: z
    .object({
      type: z.enum(["always", "business_hours", "off_hours", "custom"]),
      custom_cron: z.string().max(120).optional(),
    })
    .optional(),
});

export const listAgentOverrides = createServerFn({ method: "GET" })
  .middleware([withTenant])
  .handler(async ({ context }): Promise<AgentOverride[]> => {
    const { supabase, tenantId } = context;

    const [{ data: rows, error: e1 }, { data: logs, error: e2 }] = await Promise.all([
      supabase
        .from("ai_agents")
        .select("agent_id,enabled,mode,confidence_threshold,confidence_profile,notify_on,schedule,status,status_message")
        .eq("tenant_id", tenantId),
      supabase
        .from("ai_agent_activity_logs")
        .select("id,agent_id,action,result,duration_ms,created_at")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(500),
    ]);
    if (e1) throw new Error(e1.message);
    if (e2) throw new Error(e2.message);

    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    const byAgent = new Map<string, typeof logs>();
    (logs ?? []).forEach((l) => {
      const arr = byAgent.get(l.agent_id) ?? [];
      arr.push(l);
      byAgent.set(l.agent_id, arr);
    });

    return (rows ?? []).map((r) => {
      const agentLogs = byAgent.get(r.agent_id) ?? [];
      const today = agentLogs.filter((l) => now - new Date(l.created_at).getTime() < dayMs);
      const success = agentLogs.filter((l) => l.result === "success").length;
      const durations = agentLogs.map((l) => l.duration_ms).filter((d): d is number => d != null);
      const avg = durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0;

      return {
        agent_id: r.agent_id,
        settings: {
          enabled: r.enabled,
          mode: r.mode as AgentSettings["mode"],
          confidence_threshold: Number(r.confidence_threshold),
          confidence_profile: r.confidence_profile as AgentSettings["confidence_profile"],
          notify_on: r.notify_on as AgentSettings["notify_on"],
          schedule: r.schedule as AgentSettings["schedule"],
        },
        status: r.status as AgentStatus,
        status_message: r.status_message,
        stats: {
          tasks_today: today.length,
          tasks_total: agentLogs.length,
          success_rate: agentLogs.length ? success / agentLogs.length : 1,
          avg_duration_ms: avg,
          last_run: agentLogs[0]?.created_at ?? null,
        },
        recent_activity: agentLogs.slice(0, 10).map((l) => ({
          id: l.id,
          timestamp: l.created_at,
          action: l.action,
          result: l.result as AgentActivity["result"],
          duration_ms: l.duration_ms ?? undefined,
        })),
      };
    });
  });

export const upsertAgentSettings = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((input: unknown) =>
    z.object({
      agent_id: z.string().min(1).max(64),
      settings: settingsSchema,
      status: z.enum(["online", "working", "idle", "warning", "error", "disabled"]).optional(),
      status_message: z.string().max(500).nullable().optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, tenantId } = context;
    const { error } = await supabase
      .from("ai_agents")
      .upsert(
        {
          tenant_id: tenantId,
          agent_id: data.agent_id,
          enabled: data.settings.enabled,
          mode: data.settings.mode,
          confidence_threshold: data.settings.confidence_threshold,
          confidence_profile: data.settings.confidence_profile,
          notify_on: data.settings.notify_on,
          schedule: data.settings.schedule ?? { type: "always" },
          status: data.status ?? (data.settings.enabled ? "idle" : "disabled"),
          status_message: data.status_message ?? null,
        },
        { onConflict: "tenant_id,agent_id" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const logAgentActivity = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((input: unknown) =>
    z.object({
      agent_id: z.string().min(1).max(64),
      action: z.string().min(1).max(500),
      result: z.enum(["success", "warning", "error"]).default("success"),
      duration_ms: z.number().int().nonnegative().optional(),
      metadata: z.record(z.string(), z.unknown()).optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, tenantId } = context;
    const { error } = await supabase.from("ai_agent_activity_logs").insert({
      tenant_id: tenantId,
      agent_id: data.agent_id,
      action: data.action,
      result: data.result,
      duration_ms: data.duration_ms ?? null,
      metadata: (data.metadata ?? null) as never,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
