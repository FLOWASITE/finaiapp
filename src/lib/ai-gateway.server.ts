/**
 * Server-only: phân giải AI model đang dùng.
 *
 * Ưu tiên: bảng `ai_model_config` (Super Admin cấu hình) — endpoint
 * OpenAI-compatible bất kỳ. Nếu chưa bật / chưa có key, fallback về
 * Lovable AI Gateway (LOVABLE_API_KEY).
 */
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway";
import { decryptSecret } from "@/lib/crypto-secret.server";

export type ModelPurpose = "default" | "chat" | "parse" | "reasoning" | "classify";

export type AgentKey =
  | "bank_reconcile"
  | "journal"
  | "parse_doc_vision"
  | "parse_doc_text"
  | "invoice_extract"
  | "classify_file"
  | "chat";

type CachedConfig = {
  enabled: boolean;
  base_url: string;
  api_key_encrypted: string | null;
  extra_headers: Record<string, string>;
  model_default: string;
  model_chat: string | null;
  model_parse: string | null;
  model_reasoning: string | null;
  model_classify: string | null;
  provider_label: string;
};

let cache: { at: number; value: CachedConfig | null } | null = null;
const TTL_MS = 30_000;

async function loadConfig(): Promise<CachedConfig | null> {
  const now = Date.now();
  if (cache && now - cache.at < TTL_MS) return cache.value;
  const { data, error } = await supabaseAdmin
    .from("ai_model_config")
    .select(
      "enabled, base_url, api_key_encrypted, extra_headers, model_default, model_chat, model_parse, model_reasoning, model_classify, provider_label",
    )
    .eq("id", 1)
    .maybeSingle();
  const value: CachedConfig | null = error || !data
    ? null
    : {
        enabled: !!data.enabled,
        base_url: String(data.base_url || ""),
        api_key_encrypted: (data.api_key_encrypted as string | null) || null,
        extra_headers: (data.extra_headers as Record<string, string>) || {},
        model_default: String(data.model_default || "gpt-4o-mini"),
        model_chat: (data.model_chat as string | null) || null,
        model_parse: (data.model_parse as string | null) || null,
        model_reasoning: (data.model_reasoning as string | null) || null,
        model_classify: ((data as any).model_classify as string | null) || null,
        provider_label: String(data.provider_label || "Custom"),
      };
  cache = { at: now, value };
  return value;
}

/** Invalidate cache khi save config */
export function invalidateAiModelCache() {
  cache = null;
  agentCache = null;
}

// Cache mapping agent_key -> { model_name | null, purpose }
type AgentRow = { model_name: string | null; purpose: ModelPurpose };
let agentCache: { at: number; value: Record<string, AgentRow> } | null = null;

async function loadAgentMap(): Promise<Record<string, AgentRow>> {
  const now = Date.now();
  if (agentCache && now - agentCache.at < TTL_MS) return agentCache.value;
  const { data } = await supabaseAdmin
    .from("ai_agent_models")
    .select("agent_key, model_name, purpose");
  const map: Record<string, AgentRow> = {};
  for (const r of data ?? []) {
    map[String(r.agent_key)] = {
      model_name: (r.model_name as string | null) || null,
      purpose: (r.purpose as ModelPurpose) || "default",
    };
  }
  agentCache = { at: now, value: map };
  return map;
}

/**
 * Trả về model cho 1 AI Agent cụ thể.
 * Nếu Super Admin đã set `model_name` cho agent → dùng model đó (với provider hiện hành).
 * Nếu không → fallback resolveActiveModel(purpose, lovableFallback).
 */
export async function resolveAgentModel(
  agentKey: AgentKey,
  lovableFallbackModel: string = "google/gemini-3-flash-preview",
) {
  const map = await loadAgentMap();
  const row = map[agentKey];
  const purpose: ModelPurpose = row?.purpose ?? "default";

  if (row?.model_name) {
    const cfg = await loadConfig();
    if (cfg && cfg.enabled && cfg.api_key_encrypted && cfg.base_url) {
      try {
        const apiKey = await decryptSecret(cfg.api_key_encrypted);
        const provider = createOpenAICompatible({
          name: "custom-admin",
          baseURL: cfg.base_url.replace(/\/+$/, ""),
          headers: {
            Authorization: `Bearer ${apiKey}`,
            ...(cfg.extra_headers || {}),
          },
        });
        return {
          model: provider(row.model_name),
          source: "custom" as const,
          providerLabel: cfg.provider_label,
          modelName: row.model_name,
        };
      } catch (e) {
        console.error("[ai-model] agent provider failed, fallback Lovable:", e);
      }
    }
    // Custom provider chưa bật → dùng Lovable với chính model_name agent chỉ định
    const lovableKey = process.env.LOVABLE_API_KEY;
    if (lovableKey) {
      const gateway = createLovableAiGatewayProvider(lovableKey);
      return {
        model: gateway(row.model_name),
        source: "lovable" as const,
        providerLabel: "Lovable AI",
        modelName: row.model_name,
      };
    }
  }

  return resolveActiveModel(purpose, lovableFallbackModel);
}

function pickModelName(cfg: CachedConfig, purpose: ModelPurpose): string {
  if (purpose === "chat") return cfg.model_chat || cfg.model_default;
  if (purpose === "parse") return cfg.model_parse || cfg.model_default;
  if (purpose === "reasoning") return cfg.model_reasoning || cfg.model_default;
  if (purpose === "classify") return cfg.model_classify || cfg.model_default;
  return cfg.model_default;
}

/**
 * Trả về language model AI SDK theo cấu hình hiện tại.
 * Nếu superadmin chưa bật, dùng Lovable AI làm fallback.
 */
export async function resolveActiveModel(
  purpose: ModelPurpose = "default",
  lovableFallbackModel: string = "google/gemini-3-flash-preview",
) {
  const cfg = await loadConfig();
  if (cfg && cfg.enabled && cfg.api_key_encrypted && cfg.base_url) {
    try {
      const apiKey = await decryptSecret(cfg.api_key_encrypted);
      const provider = createOpenAICompatible({
        name: "custom-admin",
        baseURL: cfg.base_url.replace(/\/+$/, ""),
        headers: {
          Authorization: `Bearer ${apiKey}`,
          ...(cfg.extra_headers || {}),
        },
      });
      const modelName = pickModelName(cfg, purpose);
      return {
        model: provider(modelName),
        source: "custom" as const,
        providerLabel: cfg.provider_label,
        modelName,
      };
    } catch (e) {
      // nếu giải mã/khởi tạo lỗi, fallback Lovable bên dưới
      console.error("[ai-model] custom provider failed, fallback Lovable:", e);
    }
  }
  const lovableKey = process.env.LOVABLE_API_KEY;
  if (!lovableKey) throw new Error("Chưa cấu hình AI Model và thiếu LOVABLE_API_KEY");
  const gateway = createLovableAiGatewayProvider(lovableKey);
  return {
    model: gateway(lovableFallbackModel),
    source: "lovable" as const,
    providerLabel: "Lovable AI",
    modelName: lovableFallbackModel,
  };
}
