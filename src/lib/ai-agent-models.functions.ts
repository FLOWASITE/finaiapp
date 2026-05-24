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

export const listAgentModels = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertSuperadmin(supabase, userId);

    const [{ data: agents, error }, { data: providers }] = await Promise.all([
      supabaseAdmin
        .from("ai_agent_models")
        .select(
          "agent_key, label, description, purpose, model_name, is_active, provider_id, temperature, max_tokens, updated_at",
        )
        .order("agent_key"),
      supabaseAdmin
        .from("ai_providers")
        .select("id, label, enabled, is_default")
        .order("is_default", { ascending: false })
        .order("label"),
    ]);
    if (error) throw new Error(error.message);

    const providerMap = new Map<string, { id: string; label: string; enabled: boolean; is_default: boolean }>();
    for (const p of providers ?? []) {
      providerMap.set(p.id as string, {
        id: p.id as string,
        label: p.label as string,
        enabled: !!p.enabled,
        is_default: !!p.is_default,
      });
    }
    const defaultProvider = (providers ?? []).find((p: any) => p.is_default && p.enabled) as any;

    return {
      providers: (providers ?? []).map((p: any) => ({
        id: p.id,
        label: p.label,
        enabled: !!p.enabled,
        is_default: !!p.is_default,
      })),
      default_provider_label: defaultProvider?.label ?? null,
      agents: (agents ?? []).map((r: any) => {
        const prov = r.provider_id ? providerMap.get(r.provider_id) : null;
        return {
          agent_key: r.agent_key,
          label: r.label,
          description: r.description,
          purpose: r.purpose,
          model_name: r.model_name,
          is_active: r.is_active !== false,
          provider_id: r.provider_id ?? null,
          provider_label: prov?.label ?? null,
          temperature: r.temperature != null ? Number(r.temperature) : null,
          max_tokens: r.max_tokens != null ? Number(r.max_tokens) : null,
          updated_at: r.updated_at,
        };
      }),
    };
  });

const SaveSchema = z.object({
  agent_key: z.string().min(1).max(100),
  model_name: z.string().max(200).nullable(),
  provider_id: z.string().uuid().nullable().optional().default(null),
  temperature: z.number().min(0).max(2).nullable().optional().default(null),
  max_tokens: z.number().int().min(1).max(200000).nullable().optional().default(null),
});

export const saveAgentModel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => SaveSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertSuperadmin(supabase, userId);
    const patch: Record<string, any> = {
      model_name: data.model_name && data.model_name.trim() ? data.model_name.trim() : null,
      updated_at: new Date().toISOString(),
      updated_by: userId,
    };
    if (data.provider_id !== undefined) patch.provider_id = data.provider_id;
    if (data.temperature !== undefined) patch.temperature = data.temperature;
    if (data.max_tokens !== undefined) patch.max_tokens = data.max_tokens;
    const { error } = await supabaseAdmin
      .from("ai_agent_models")
      .update(patch as any)
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
      .update({
        model_name: null,
        provider_id: null,
        temperature: null,
        max_tokens: null,
        updated_at: new Date().toISOString(),
        updated_by: userId,
      } as any)
      .neq("agent_key", "");
    if (error) throw new Error(error.message);
    invalidateAiModelCache();
    return { ok: true };
  });
