import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { withTenant } from "@/integrations/supabase/with-tenant";

export type DigestTemplate = "short" | "standard" | "detailed";

export type DigestPrefs = {
  enabled: boolean;
  send_hour: number;
  last_sent_date: string | null;
  template: DigestTemplate;
};

export const getDigestPrefs = createServerFn({ method: "GET" })
  .middleware([withTenant])
  .handler(async ({ context }): Promise<DigestPrefs> => {
    const { supabase, userId, tenantId } = context;
    const { data, error } = await supabase
      .from("user_digest_prefs")
      .select("enabled,send_hour,last_sent_date,template")
      .eq("user_id", userId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (
      (data as DigestPrefs | null) ?? {
        enabled: true,
        send_hour: 8,
        last_sent_date: null,
        template: "standard",
      }
    );
  });

export const updateDigestPrefs = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i: unknown) =>
    z
      .object({
        enabled: z.boolean().optional(),
        send_hour: z.number().int().min(0).max(23).optional(),
        template: z.enum(["short", "standard", "detailed"]).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }): Promise<DigestPrefs> => {
    const { supabase, userId, tenantId } = context;
    const payload: any = { user_id: userId, tenant_id: tenantId };
    if (data.enabled !== undefined) payload.enabled = data.enabled;
    if (data.send_hour !== undefined) payload.send_hour = data.send_hour;
    if (data.template !== undefined) payload.template = data.template;
    const { data: row, error } = await supabase
      .from("user_digest_prefs")
      .upsert(payload, { onConflict: "user_id,tenant_id" })
      .select("enabled,send_hour,last_sent_date,template")
      .single();
    if (error) throw new Error(error.message);
    return row as DigestPrefs;
  });

/** Trigger generation now (synchronous, for "Send test" button). */
export const sendDigestNow = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .handler(async ({ context }): Promise<{ thread_id: string; message_id: string }> => {
    const { supabase, userId, tenantId } = context;
    const { data: prefs } = await supabase
      .from("user_digest_prefs")
      .select("template")
      .eq("user_id", userId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    const template = ((prefs as any)?.template ?? "standard") as DigestTemplate;
    const { generateAndPostDigest } = await import("@/lib/digest-generator.server");
    const t0 = Date.now();
    const result = await generateAndPostDigest({ userId, tenantId, supabase, force: true, template });
    try {
      const { tryLogAgentActivity } = await import("@/lib/ai-agents.server");
      await tryLogAgentActivity(supabase, userId, {
        agent_id: "report",
        action: `Sinh bản tóm tắt (${template})`,
        result: "success",
        duration_ms: Date.now() - t0,
        metadata: { template, thread_id: result.thread_id },
      });
    } catch {}
    return result;
  });

/** Count digest messages newer than the timestamp (for ChatDock badge). */
export const countUnreadDigests = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i: unknown) =>
    z.object({ since: z.string().optional() }).parse(i ?? {}),
  )
  .handler(async ({ data, context }): Promise<{ count: number; latest_thread_id: string | null }> => {
    const { supabase, userId, tenantId } = context;
    let q = supabase
      .from("chat_messages")
      .select("id,thread_id,created_at", { count: "exact" })
      .eq("user_id", userId)
      .eq("tenant_id", tenantId)
      .eq("role", "assistant")
      .contains("metadata", { kind: "daily_digest" })
      .order("created_at", { ascending: false })
      .limit(1);
    if (data.since) q = q.gt("created_at", data.since);
    const { data: rows, count, error } = await q;
    if (error) throw new Error(error.message);
    return {
      count: count ?? 0,
      latest_thread_id: rows && rows[0] ? (rows[0] as any).thread_id : null,
    };
  });
