import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { withTenant } from "@/integrations/supabase/with-tenant";

export type DigestPrefs = {
  enabled: boolean;
  send_hour: number;
  last_sent_date: string | null;
};

export const getDigestPrefs = createServerFn({ method: "GET" })
  .middleware([withTenant])
  .handler(async ({ context }): Promise<DigestPrefs> => {
    const { supabase, userId, tenantId } = context;
    const { data, error } = await supabase
      .from("user_digest_prefs")
      .select("enabled,send_hour,last_sent_date")
      .eq("user_id", userId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ?? { enabled: true, send_hour: 8, last_sent_date: null };
  });

export const updateDigestPrefs = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i: unknown) =>
    z
      .object({
        enabled: z.boolean().optional(),
        send_hour: z.number().int().min(0).max(23).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }): Promise<DigestPrefs> => {
    const { supabase, userId, tenantId } = context;
    const payload: any = { user_id: userId, tenant_id: tenantId };
    if (data.enabled !== undefined) payload.enabled = data.enabled;
    if (data.send_hour !== undefined) payload.send_hour = data.send_hour;
    const { data: row, error } = await supabase
      .from("user_digest_prefs")
      .upsert(payload, { onConflict: "user_id,tenant_id" })
      .select("enabled,send_hour,last_sent_date")
      .single();
    if (error) throw new Error(error.message);
    return row as DigestPrefs;
  });

/** Trigger generation now (synchronous, for "Send test" button). */
export const sendDigestNow = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .handler(async ({ context }): Promise<{ thread_id: string; message_id: string }> => {
    const { supabase, userId, tenantId } = context;
    // Lazy import to keep client bundle clean
    const { generateAndPostDigest } = await import("@/lib/digest-generator.server");
    return generateAndPostDigest({ userId, tenantId, supabase, force: true });
  });
