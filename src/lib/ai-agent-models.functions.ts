import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { invalidateAiModelCache } from "@/lib/ai-gateway.server";

async function assertSuperadmin(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const ok = (data ?? []).some((r: any) => r.role === "superadmin");
  if (!ok) throw new Error("Cần quyền Super-admin để thực hiện thao tác này.");
}

/** Liệt kê toàn bộ AI Agent + model đang gán (null = kế thừa purpose). */
export const listAgentModels = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertSuperadmin(supabase, userId);
    const { data, error } = await supabaseAdmin
      .from("ai_agent_models")
      .select("agent_key, label, description, purpose, model_name, is_active, updated_at")
      .order("agent_key");
    if (error) throw new Error(error.message);

    // Đọc cấu hình purpose mặc định để hiển thị "effective model"
    const { data: cfg } = await supabaseAdmin
      .from("ai_model_config")
      .select("model_default, model_chat, model_parse, model_reasoning, model_classify")
      .eq("id", 1)
      .maybeSingle();
    const pickPurposeDefault = (p: string): string => {
      const c: any = cfg || {};
      if (p === "chat") return c.model_chat || c.model_default || "";
      if (p === "parse") return c.model_parse || c.model_default || "";
      if (p === "reasoning") return c.model_reasoning || c.model_default || "";
      if (p === "classify") return c.model_classify || c.model_default || "";
      return c.model_default || "";
    };

    return {
      agents: (data ?? []).map((r: any) => ({
        agent_key: r.agent_key,
        label: r.label,
        description: r.description,
        purpose: r.purpose,
        model_name: r.model_name,
        is_active: r.is_active !== false,
        effective_model: r.model_name || pickPurposeDefault(r.purpose) || "(Lovable fallback)",
        updated_at: r.updated_at,
      })),
    };
  });

const SaveSchema = z.object({
  agent_key: z.string().min(1).max(100),
  model_name: z.string().max(200).nullable(),
});

export const saveAgentModel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => SaveSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertSuperadmin(supabase, userId);
    const { error } = await supabaseAdmin
      .from("ai_agent_models")
      .update({
        model_name: data.model_name && data.model_name.trim() ? data.model_name.trim() : null,
        updated_at: new Date().toISOString(),
        updated_by: userId,
      })
      .eq("agent_key", data.agent_key);
    if (error) throw new Error(error.message);
    invalidateAiModelCache();
    return { ok: true };
  });

export const resetAllAgentModels = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertSuperadmin(supabase, userId);
    const { error } = await supabaseAdmin
      .from("ai_agent_models")
      .update({ model_name: null, updated_at: new Date().toISOString(), updated_by: userId })
      .neq("agent_key", "");
    if (error) throw new Error(error.message);
    invalidateAiModelCache();
    return { ok: true };
  });
