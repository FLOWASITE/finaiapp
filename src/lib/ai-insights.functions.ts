import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listAiInsights = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("ai_insights")
      .select("*")
      .is("dismissed_at", null)
      .order("severity", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(10);
    if (error) throw new Error(error.message);
    return { insights: data ?? [] };
  });

export const dismissAiInsight = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("ai_insights")
      .update({ dismissed_at: new Date().toISOString(), dismissed_by: userId })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    try {
      const { tryLogAgentActivity } = await import("@/lib/ai-agents.server");
      await tryLogAgentActivity(supabase, userId, {
        agent_id: "alert",
        action: `Đóng cảnh báo AI`,
        result: "success",
        metadata: { insight_id: data.id },
      });
    } catch {}
    return { ok: true };
  });
