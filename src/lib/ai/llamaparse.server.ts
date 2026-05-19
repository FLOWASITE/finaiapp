/**
 * Server-only client for LlamaParse (LlamaIndex Cloud).
 *
 * Pipeline: upload file → poll job → fetch markdown.
 * Used by `parse-document.functions.ts` as a layout-aware
 * pre-processor before the structuring LLM pass.
 */

const BASE_URL =
  process.env.LLAMA_CLOUD_BASE_URL || "https://api.cloud.llamaindex.ai";

const POLL_INTERVAL_MS = 1500;
const POLL_TIMEOUT_MS = 120_000;

export type LlamaParseTier = "fast" | "balanced" | "premium";

const TIER_TO_MODE: Record<LlamaParseTier, Record<string, unknown>> = {
  // v1 API parameter names. "balanced" is the sweet spot for invoices.
  fast: { parse_mode: "parse_page_without_llm" },
  balanced: { parse_mode: "parse_page_with_lvm" },
  premium: { parse_mode: "parse_page_with_agent" },
};

export function isLlamaParseEnabled(): boolean {
  return !!process.env.LLAMA_CLOUD_API_KEY;
}

async function authHeaders(): Promise<Record<string, string>> {
  const key = process.env.LLAMA_CLOUD_API_KEY;
  if (!key) throw new Error("LLAMA_CLOUD_API_KEY is not configured");
  return { Authorization: `Bearer ${key}` };
}

/** Upload file → return job id. */
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
  // Map tier → mode flags
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

/** Poll job → resolve when SUCCESS, reject on ERROR/timeout. */
async function waitForJob(jobId: string): Promise<void> {
  const headers = await authHeaders();
  const deadline = Date.now() + POLL_TIMEOUT_MS;
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
  throw new Error(`LlamaParse job ${jobId} timed out after ${POLL_TIMEOUT_MS}ms`);
}

/** Fetch markdown result. */
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

/** One-shot: parse a file to markdown via LlamaParse. */
export async function parseToMarkdown(opts: {
  fileBase64: string;
  mimeType: string;
  filename?: string;
  tier?: LlamaParseTier;
}): Promise<string> {
  const fileBuf = Buffer.from(opts.fileBase64, "base64");
  const jobId = await uploadJob(
    fileBuf,
    opts.mimeType,
    opts.filename || "document",
    opts.tier || "balanced",
  );
  await waitForJob(jobId);
  return await fetchMarkdown(jobId);
}
