/**
 * Server-only client for LlamaParse (LlamaIndex Cloud).
 *
 * Pipeline: upload file → poll job → fetch markdown / per-page JSON.
 * Used by `parse-document.functions.ts` as a layout-aware
 * pre-processor before the structuring LLM pass.
 */

const BASE_URL =
  process.env.LLAMA_CLOUD_BASE_URL || "https://api.cloud.llamaindex.ai";

const POLL_INTERVAL_MS = 1500;
const POLL_TIMEOUT_FLOOR_MS = 60_000;
const POLL_TIMEOUT_CEIL_MS = 300_000;

export type LlamaParseTier = "fast" | "balanced" | "premium";

const TIER_TO_MODE: Record<LlamaParseTier, Record<string, unknown>> = {
  fast: { parse_mode: "parse_page_without_llm" },
  balanced: { parse_mode: "parse_page_with_lvm" },
  premium: { parse_mode: "parse_page_with_agent" },
};

export function isLlamaParseEnabled(): boolean {
  return !!process.env.LLAMA_CLOUD_API_KEY;
}

/** Timeout grows with file size: 60s + 2s per 100KB, capped at 5min. */
function computeTimeoutMs(fileBytes: number): number {
  const dynamic = POLL_TIMEOUT_FLOOR_MS + Math.ceil(fileBytes / 100_000) * 2000;
  return Math.min(POLL_TIMEOUT_CEIL_MS, Math.max(POLL_TIMEOUT_FLOOR_MS, dynamic));
}

async function authHeaders(): Promise<Record<string, string>> {
  const key = process.env.LLAMA_CLOUD_API_KEY;
  if (!key) throw new Error("LLAMA_CLOUD_API_KEY is not configured");
  return { Authorization: `Bearer ${key}` };
}

async function uploadJob(
  fileBuf: Buffer,
  mimeType: string,
  filename: string,
  tier: LlamaParseTier,
): Promise<string> {
  const form = new FormData();
  const ab = fileBuf.buffer.slice(
    fileBuf.byteOffset,
    fileBuf.byteOffset + fileBuf.byteLength,
  ) as ArrayBuffer;
  const blob = new Blob([ab], { type: mimeType });
  form.append("file", blob, filename);
  form.append("language", "vi");
  for (const [k, v] of Object.entries(TIER_TO_MODE[tier])) {
    form.append(k, String(v));
  }

  const res = await fetch(`${BASE_URL}/api/v1/parsing/upload`, {
    method: "POST",
    headers: await authHeaders(),
    body: form,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`LlamaParse upload failed [${res.status}]: ${body.slice(0, 300)}`);
  }
  const json = (await res.json()) as { id?: string };
  if (!json.id) throw new Error("LlamaParse upload returned no job id");
  return json.id;
}

async function waitForJob(jobId: string, timeoutMs: number): Promise<void> {
  const headers = await authHeaders();
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await fetch(`${BASE_URL}/api/v1/parsing/job/${jobId}`, { headers });
    if (res.ok) {
      const json = (await res.json()) as { status?: string };
      const status = (json.status || "").toUpperCase();
      if (status === "SUCCESS") return;
      if (status === "ERROR" || status === "CANCELLED" || status === "FAILED") {
        throw new Error(`LlamaParse job ${jobId} ended with status ${status}`);
      }
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new Error(`LlamaParse job ${jobId} timed out after ${timeoutMs}ms`);
}

async function fetchMarkdown(jobId: string): Promise<string> {
  const res = await fetch(
    `${BASE_URL}/api/v1/parsing/job/${jobId}/result/markdown`,
    { headers: await authHeaders() },
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `LlamaParse markdown fetch failed [${res.status}]: ${body.slice(0, 300)}`,
    );
  }
  const json = (await res.json()) as { markdown?: string };
  return json.markdown || "";
}

/** Per-page result via the JSON endpoint. Keeps page boundaries for chunking. */
async function fetchPages(jobId: string): Promise<string[]> {
  const res = await fetch(
    `${BASE_URL}/api/v1/parsing/job/${jobId}/result/json`,
    { headers: await authHeaders() },
  );
  if (!res.ok) return [];
  const json = (await res.json()) as { pages?: Array<{ md?: string; text?: string }> };
  if (!Array.isArray(json.pages)) return [];
  return json.pages.map((p) => p.md || p.text || "");
}

export type ParseResult = {
  markdown: string;
  pages: string[]; // per-page markdown (may be empty if endpoint not available)
  pageCount: number;
  tierUsed: LlamaParseTier;
};

/**
 * Parse a file via LlamaParse. Retries once on ERROR/timeout, downgrading
 * `balanced → fast` so we still get a result for hard files.
 */
export async function parseDocument(opts: {
  fileBase64: string;
  mimeType: string;
  filename?: string;
  tier?: LlamaParseTier;
}): Promise<ParseResult> {
  const fileBuf = Buffer.from(opts.fileBase64, "base64");
  const timeoutMs = computeTimeoutMs(fileBuf.byteLength);
  const tiers: LlamaParseTier[] = [opts.tier || "balanced"];
  if (tiers[0] !== "fast") tiers.push("fast");

  let lastErr: unknown;
  for (const tier of tiers) {
    try {
      const jobId = await uploadJob(
        fileBuf,
        opts.mimeType,
        opts.filename || "document",
        tier,
      );
      await waitForJob(jobId, timeoutMs);
      const [markdown, pages] = await Promise.all([
        fetchMarkdown(jobId),
        fetchPages(jobId).catch(() => [] as string[]),
      ]);
      return {
        markdown,
        pages,
        pageCount: pages.length || (markdown ? 1 : 0),
        tierUsed: tier,
      };
    } catch (e) {
      lastErr = e;
      console.warn(`[llamaparse] tier=${tier} failed:`, (e as Error)?.message);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("LlamaParse failed");
}

/** Backwards-compatible: markdown only. */
export async function parseToMarkdown(opts: {
  fileBase64: string;
  mimeType: string;
  filename?: string;
  tier?: LlamaParseTier;
}): Promise<string> {
  const r = await parseDocument(opts);
  return r.markdown;
}
