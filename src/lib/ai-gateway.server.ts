/**
 * Server-only: phân giải AI model cho từng Agent.
 *
 * Mô hình mới: nhiều Provider song song trong bảng `ai_providers`.
 * Agent gán `provider_id + model_name` + optional `temperature/max_tokens`.
 * Nếu Agent thiếu cấu hình -> dùng provider `is_default=true`.
 * Nếu không có provider nào enabled -> fallback Lovable AI Gateway.
 */
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway";
import { decryptSecret } from "@/lib/crypto-secret.server";

export type AgentKey =
  | "bank_reconcile"
  | "journal"
  | "parse_doc_vision"
  | "parse_doc_text"
  | "invoice_extract"
  | "classify_file"
  | "chat";

type ProviderRow = {
  id: string;
  code: string;
  label: string;
  base_url: string;
  api_key_encrypted: string | null;
  extra_headers: Record<string, string>;
  enabled: boolean;
  is_default: boolean;
};

type AgentRow = {
  provider_id: string | null;
  model_name: string | null;
  temperature: number | null;
  max_tokens: number | null;
};

const TTL_MS = 30_000;
let providerCache: { at: number; rows: ProviderRow[] } | null = null;
let agentCache: { at: number; map: Record<string, AgentRow> } | null = null;

export function invalidateAiModelCache() {
  providerCache = null;
  agentCache = null;
}

async function loadProviders(): Promise<ProviderRow[]> {
  const now = Date.now();
  if (providerCache && now - providerCache.at < TTL_MS) return providerCache.rows;
  const { data } = await supabaseAdmin
    .from("ai_providers")
    .select("id, code, label, base_url, api_key_encrypted, extra_headers, enabled, is_default");
  const rows: ProviderRow[] = (data ?? []).map((r: any) => ({
    id: r.id,
    code: r.code,
    label: r.label,
    base_url: r.base_url,
    api_key_encrypted: r.api_key_encrypted,
    extra_headers: (r.extra_headers as Record<string, string>) || {},
    enabled: !!r.enabled,
    is_default: !!r.is_default,
  }));
  providerCache = { at: now, rows };
  return rows;
}

async function loadAgentMap(): Promise<Record<string, AgentRow>> {
  const now = Date.now();
  if (agentCache && now - agentCache.at < TTL_MS) return agentCache.map;
  const { data } = await supabaseAdmin
    .from("ai_agent_models")
    .select("agent_key, provider_id, model_name, temperature, max_tokens");
  const map: Record<string, AgentRow> = {};
  for (const r of data ?? []) {
    map[String(r.agent_key)] = {
      provider_id: (r.provider_id as string | null) || null,
      model_name: (r.model_name as string | null) || null,
      temperature: r.temperature != null ? Number(r.temperature) : null,
      max_tokens: r.max_tokens != null ? Number(r.max_tokens) : null,
    };
  }
  agentCache = { at: now, map };
  return map;
}

async function buildFromProvider(p: ProviderRow, modelName: string) {
  if (!p.api_key_encrypted) throw new Error(`Provider ${p.label} chưa có API key`);
  const apiKey = await decryptSecret(p.api_key_encrypted);
  const provider = createOpenAICompatible({
    name: `provider-${p.code}`,
    baseURL: p.base_url.replace(/\/+$/, ""),
    headers: {
      Authorization: `Bearer ${apiKey}`,
      ...(p.extra_headers || {}),
    },
  });
  return {
    model: provider(modelName),
    source: "custom" as const,
    providerLabel: p.label,
    modelName,
  };
}

function lovableFallback(modelName: string) {
  const lovableKey = process.env.LOVABLE_API_KEY;
  if (!lovableKey) throw new Error("Chưa cấu hình Provider và thiếu LOVABLE_API_KEY");
  const gateway = createLovableAiGatewayProvider(lovableKey);
  return {
    model: gateway(modelName),
    source: "lovable" as const,
    providerLabel: "Lovable AI",
    modelName,
  };
}

export type ResolvedAgentModel = {
  model: any;
  source: "custom" | "lovable";
  providerLabel: string;
  modelName: string;
  temperature: number | null;
  maxOutputTokens: number | null;
};

/**
 * Trả về model + options cho 1 Agent.
 */
export async function resolveAgentModel(
  agentKey: AgentKey | string,
  lovableFallbackModel: string = "google/gemini-3-flash-preview",
): Promise<ResolvedAgentModel> {
  const [providers, agentMap] = await Promise.all([loadProviders(), loadAgentMap()]);
  const row = agentMap[agentKey];
  const temperature = row?.temperature ?? null;
  const maxOutputTokens = row?.max_tokens ?? null;

  // 1) Agent đã gán provider cụ thể
  if (row?.provider_id && row.model_name) {
    const p = providers.find((x) => x.id === row.provider_id && x.enabled);
    if (p) {
      try {
        const r = await buildFromProvider(p, row.model_name);
        return { ...r, temperature, maxOutputTokens };
      } catch (e) {
        console.error("[ai-model] agent provider failed, fallback:", e);
      }
    }
  }

  // 2) Provider default + model của agent (hoặc fallback)
  const def = providers.find((x) => x.is_default && x.enabled);
  const modelName = row?.model_name || lovableFallbackModel;
  if (def) {
    try {
      const r = await buildFromProvider(def, modelName);
      return { ...r, temperature, maxOutputTokens };
    } catch (e) {
      console.error("[ai-model] default provider failed, fallback Lovable:", e);
    }
  }

  // 3) Lovable fallback ẩn
  return { ...lovableFallback(modelName), temperature, maxOutputTokens };
}

/**
 * Compat shim cho code cũ. Sẽ bị loại dần.
 */
export async function resolveActiveModel(
  _purpose: string = "default",
  lovableFallbackModel: string = "google/gemini-3-flash-preview",
) {
  return resolveAgentModel("chat", lovableFallbackModel);
}

/** Helper: trả về object để spread thẳng vào generateText/streamText. */
export function agentCallOptions(r: ResolvedAgentModel) {
  const opts: Record<string, any> = { model: r.model };
  if (r.temperature != null) opts.temperature = r.temperature;
  if (r.maxOutputTokens != null) opts.maxOutputTokens = r.maxOutputTokens;
  return opts;
}
