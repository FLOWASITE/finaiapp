import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { encryptSecret, decryptSecret } from "@/lib/crypto-secret.server";
import { invalidateAiModelCache } from "@/lib/ai-gateway.server";

async function assertSuperadmin(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const ok = (data ?? []).some((r: any) => r.role === "superadmin");
  if (!ok) throw new Error("Cần quyền Super-admin để thực hiện thao tác này.");
}

/** Trả về cấu hình hiện tại (KHÔNG kèm api key plaintext). */
export const getAiModelConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertSuperadmin(supabase, userId);
    const { data, error } = await supabaseAdmin
      .from("ai_model_config")
      .select(
        "id, enabled, provider_label, base_url, model_default, model_chat, model_parse, model_reasoning, extra_headers, notes, updated_at, updated_by, api_key_encrypted",
      )
      .eq("id", 1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const hasKey = !!data?.api_key_encrypted;
    return {
      config: {
        id: 1,
        enabled: !!data?.enabled,
        provider_label: data?.provider_label ?? "Custom OpenAI-compatible",
        base_url: data?.base_url ?? "https://api.openai.com/v1",
        model_default: data?.model_default ?? "gpt-4o-mini",
        model_chat: data?.model_chat ?? "",
        model_parse: data?.model_parse ?? "",
        model_reasoning: data?.model_reasoning ?? "",
        extra_headers: (data?.extra_headers as Record<string, string>) ?? {},
        notes: data?.notes ?? "",
        updated_at: data?.updated_at ?? null,
        updated_by: data?.updated_by ?? null,
      },
      hasApiKey: hasKey,
    };
  });

const SaveSchema = z.object({
  enabled: z.boolean(),
  provider_label: z.string().min(1).max(120),
  base_url: z.string().url().max(500),
  model_default: z.string().min(1).max(200),
  model_chat: z.string().max(200).optional().nullable(),
  model_parse: z.string().max(200).optional().nullable(),
  model_reasoning: z.string().max(200).optional().nullable(),
  extra_headers: z.record(z.string().max(200), z.string().max(2000)).optional(),
  notes: z.string().max(2000).optional().nullable(),
  // Nếu undefined: giữ key cũ. Nếu chuỗi rỗng: xoá key.
  api_key: z.string().max(4000).optional(),
});

export const saveAiModelConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => SaveSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertSuperadmin(supabase, userId);

    const patch: Record<string, any> = {
      enabled: data.enabled,
      provider_label: data.provider_label,
      base_url: data.base_url,
      model_default: data.model_default,
      model_chat: data.model_chat || null,
      model_parse: data.model_parse || null,
      model_reasoning: data.model_reasoning || null,
      extra_headers: data.extra_headers ?? {},
      notes: data.notes || null,
      updated_by: userId,
      updated_at: new Date().toISOString(),
    };
    if (data.api_key !== undefined) {
      patch.api_key_encrypted = data.api_key === "" ? null : await encryptSecret(data.api_key);
    }

    const { error } = await supabaseAdmin
      .from("ai_model_config")
      .upsert({ id: 1, ...patch }, { onConflict: "id" });
    if (error) throw new Error(error.message);
    invalidateAiModelCache();
    return { ok: true };
  });

/**
 * Ping endpoint để test cấu hình hiện tại lưu trong DB.
 * Gọi 1 message ngắn rồi đo độ trễ + phản hồi đầu.
 */
export const testAiModelConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertSuperadmin(supabase, userId);
    const { data: cfg } = await supabaseAdmin
      .from("ai_model_config")
      .select("base_url, api_key_encrypted, extra_headers, model_default")
      .eq("id", 1)
      .maybeSingle();
    if (!cfg?.api_key_encrypted) throw new Error("Chưa có API key đã lưu để test.");
    const apiKey = await decryptSecret(cfg.api_key_encrypted);
    const url = String(cfg.base_url || "").replace(/\/+$/, "") + "/chat/completions";
    const t0 = Date.now();
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        ...(((cfg.extra_headers as Record<string, string>) ?? {}) as Record<string, string>),
      },
      body: JSON.stringify({
        model: cfg.model_default,
        messages: [{ role: "user", content: "Ping. Reply with the single word: pong" }],
        max_tokens: 16,
        temperature: 0,
      }),
    });
    const ms = Date.now() - t0;
    const text = await res.text();
    if (!res.ok) {
      return { ok: false, status: res.status, latencyMs: ms, body: text.slice(0, 500) };
    }
    let reply = "";
    try {
      const j = JSON.parse(text);
      reply = j?.choices?.[0]?.message?.content ?? "";
    } catch {
      reply = text.slice(0, 200);
    }
    return { ok: true, status: res.status, latencyMs: ms, reply: String(reply).slice(0, 200) };
  });
