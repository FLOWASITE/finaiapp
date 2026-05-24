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

/** List tất cả Providers, mask api_key. */
export const listProviders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertSuperadmin(supabase, userId);
    const { data, error } = await supabaseAdmin
      .from("ai_providers")
      .select("id, code, label, base_url, extra_headers, enabled, is_default, notes, api_key_encrypted, updated_at")
      .order("is_default", { ascending: false })
      .order("label");
    if (error) throw new Error(error.message);
    return {
      providers: (data ?? []).map((r: any) => ({
        id: r.id,
        code: r.code,
        label: r.label,
        base_url: r.base_url,
        extra_headers: r.extra_headers ?? {},
        enabled: !!r.enabled,
        is_default: !!r.is_default,
        notes: r.notes ?? "",
        has_api_key: !!r.api_key_encrypted,
        updated_at: r.updated_at,
      })),
    };
  });

const SaveSchema = z.object({
  id: z.string().uuid().nullable().optional(),
  code: z.string().min(1).max(100).regex(/^[a-z0-9_-]+$/, "code chỉ chứa a-z, 0-9, _ và -"),
  label: z.string().min(1).max(160),
  base_url: z.string().url().max(500),
  api_key: z.string().max(4000).optional(), // undefined: giữ; "": xoá
  extra_headers: z.record(z.string().max(200), z.string().max(2000)).optional(),
  enabled: z.boolean(),
  is_default: z.boolean(),
  notes: z.string().max(2000).optional().nullable(),
});

export const saveProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => SaveSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertSuperadmin(supabase, userId);

    const patch: Record<string, any> = {
      code: data.code,
      label: data.label,
      base_url: data.base_url,
      extra_headers: data.extra_headers ?? {},
      enabled: data.enabled,
      is_default: data.is_default,
      notes: data.notes || null,
      updated_by: userId,
      updated_at: new Date().toISOString(),
    };
    if (data.api_key !== undefined) {
      patch.api_key_encrypted = data.api_key === "" ? null : await encryptSecret(data.api_key);
    }

    // Đảm bảo unique default: nếu set default=true, unset các row khác
    if (data.is_default) {
      await supabaseAdmin
        .from("ai_providers")
        .update({ is_default: false })
        .neq("id", data.id ?? "00000000-0000-0000-0000-000000000000");
    }

    let resultId = data.id;
    if (data.id) {
      const { error } = await supabaseAdmin.from("ai_providers").update(patch as any).eq("id", data.id);
      if (error) throw new Error(error.message);
    } else {
      const { data: ins, error } = await supabaseAdmin
        .from("ai_providers")
        .insert(patch)
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      resultId = ins.id;
    }
    invalidateAiModelCache();
    return { ok: true, id: resultId };
  });

export const deleteProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertSuperadmin(supabase, userId);
    const { count } = await supabaseAdmin
      .from("ai_agent_models")
      .select("agent_key", { count: "exact", head: true })
      .eq("provider_id", data.id);
    if ((count ?? 0) > 0) {
      throw new Error(`Provider đang được ${count} agent sử dụng. Hãy đổi provider cho các agent trước.`);
    }
    const { error } = await supabaseAdmin.from("ai_providers").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    invalidateAiModelCache();
    return { ok: true };
  });

export const testProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ id: z.string().uuid(), model: z.string().min(1).max(200) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertSuperadmin(supabase, userId);
    const { data: p } = await supabaseAdmin
      .from("ai_providers")
      .select("base_url, api_key_encrypted, extra_headers, label")
      .eq("id", data.id)
      .maybeSingle();
    if (!p?.api_key_encrypted) throw new Error("Provider chưa có API key.");
    const apiKey = await decryptSecret(p.api_key_encrypted);
    const url = String(p.base_url || "").replace(/\/+$/, "") + "/chat/completions";
    const t0 = Date.now();
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        ...(((p.extra_headers as Record<string, string>) ?? {}) as Record<string, string>),
      },
      body: JSON.stringify({
        model: data.model,
        messages: [{ role: "user", content: "Ping. Reply with the single word: pong" }],
        max_tokens: 16,
        temperature: 0,
      }),
    });
    const ms = Date.now() - t0;
    const text = await res.text();
    if (!res.ok) return { ok: false, status: res.status, latencyMs: ms, body: text.slice(0, 500) };
    let reply = "";
    try {
      const j = JSON.parse(text);
      reply = j?.choices?.[0]?.message?.content ?? "";
    } catch {
      reply = text.slice(0, 200);
    }
    return { ok: true, status: res.status, latencyMs: ms, reply: String(reply).slice(0, 200) };
  });

export const listProviderModels = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertSuperadmin(supabase, userId);
    const { data: p } = await supabaseAdmin
      .from("ai_providers")
      .select("base_url, api_key_encrypted")
      .eq("id", data.id)
      .maybeSingle();
    if (!p) throw new Error("Provider không tồn tại.");
    const url = String(p.base_url || "").replace(/\/+$/, "") + "/models";
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (p.api_key_encrypted) {
      headers["Authorization"] = `Bearer ${await decryptSecret(p.api_key_encrypted)}`;
    }
    const res = await fetch(url, { method: "GET", headers });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`);
    }
    const json: any = await res.json();
    const raw: any[] = Array.isArray(json?.data) ? json.data : Array.isArray(json) ? json : [];
    const models = raw
      .map((m: any) => {
        const id = String(m?.id ?? m?.name ?? "");
        if (!id) return null;
        return {
          id,
          name: String(m?.name ?? id),
          context_length: Number(m?.context_length ?? m?.context_window ?? 0) || null,
        };
      })
      .filter(Boolean) as Array<{ id: string; name: string; context_length: number | null }>;
    models.sort((a, b) => a.id.localeCompare(b.id));
    return { count: models.length, models };
  });
