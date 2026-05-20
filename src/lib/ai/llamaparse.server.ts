/**
 * Server-only client for LlamaParse (LlamaIndex Cloud).
 *
 * Two layers of resilience:
 *  - Per-HTTP-call retry with exponential backoff on 408/429/5xx and network errors.
 *  - Top-level tier downgrade (balanced → fast) if a whole job ends in ERROR/timeout.
 *
 * Every failure throws a `LlamaParseError` with phase, status, attempt count,
 * jobId (when known), and a short body excerpt so logs/UI can show the cause.
 */

const BASE_URL =
  process.env.LLAMA_CLOUD_BASE_URL || "https://api.cloud.llamaindex.ai";

const POLL_INTERVAL_MS = 1500;
const POLL_TIMEOUT_FLOOR_MS = 60_000;
const POLL_TIMEOUT_CEIL_MS = 300_000;

const HTTP_MAX_ATTEMPTS = 4;
const HTTP_BACKOFF_BASE_MS = 600; // 600ms, 1.2s, 2.4s, 4.8s

export type LlamaParseTier = "fast" | "balanced" | "premium";
export type LlamaParsePhase = "upload" | "poll" | "fetch_markdown" | "fetch_pages";

const TIER_TO_MODE: Record<LlamaParseTier, Record<string, unknown>> = {
  fast: { parse_mode: "parse_page_without_llm" },
  balanced: { parse_mode: "parse_page_with_lvm" },
  premium: { parse_mode: "parse_page_with_agent" },
};

export class LlamaParseError extends Error {
  phase: LlamaParsePhase;
  status?: number;
  attempts: number;
  jobId?: string;
  tier?: LlamaParseTier;
  bodyExcerpt?: string;
  retryable: boolean;
  cause?: unknown;

  constructor(opts: {
    phase: LlamaParsePhase;
    message: string;
    status?: number;
    attempts: number;
    jobId?: string;
    tier?: LlamaParseTier;
    bodyExcerpt?: string;
    retryable?: boolean;
    cause?: unknown;
  }) {
    const tag = `[LlamaParse:${opts.phase}${opts.status ? ` ${opts.status}` : ""}]`;
    const where =
      (opts.jobId ? ` job=${opts.jobId}` : "") +
      (opts.tier ? ` tier=${opts.tier}` : "") +
      ` attempts=${opts.attempts}`;
    const body = opts.bodyExcerpt ? ` :: ${opts.bodyExcerpt}` : "";
    super(`${tag}${where} — ${opts.message}${body}`);
    this.name = "LlamaParseError";
    this.phase = opts.phase;
    this.status = opts.status;
    this.attempts = opts.attempts;
    this.jobId = opts.jobId;
    this.tier = opts.tier;
    this.bodyExcerpt = opts.bodyExcerpt;
    this.retryable = !!opts.retryable;
    this.cause = opts.cause;
  }
}

export function isLlamaParseEnabled(): boolean {
  return !!process.env.LLAMA_CLOUD_API_KEY;
}

function computeTimeoutMs(fileBytes: number): number {
  const dynamic = POLL_TIMEOUT_FLOOR_MS + Math.ceil(fileBytes / 100_000) * 2000;
  return Math.min(POLL_TIMEOUT_CEIL_MS, Math.max(POLL_TIMEOUT_FLOOR_MS, dynamic));
}

function authHeaders(): Record<string, string> {
  const key = process.env.LLAMA_CLOUD_API_KEY;
  if (!key) throw new LlamaParseError({
    phase: "upload",
    message: "LLAMA_CLOUD_API_KEY is not configured",
    attempts: 0,
  });
  return { Authorization: `Bearer ${key}` };
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Fetch with retry/backoff. Honors Retry-After. Throws LlamaParseError on final failure. */
async function fetchWithRetry(
  phase: LlamaParsePhase,
  url: string,
  init: RequestInit,
  ctx: { jobId?: string; tier?: LlamaParseTier } = {},
): Promise<Response> {
  let attempt = 0;
  let lastErr: unknown;
  while (attempt < HTTP_MAX_ATTEMPTS) {
    attempt++;
    try {
      const res = await fetch(url, init);
      if (res.ok) return res;

      // Read body excerpt for diagnostics
      const bodyExcerpt = (await res.text().catch(() => "")).slice(0, 400);
      const retryable = isRetryableStatus(res.status);
      if (!retryable || attempt >= HTTP_MAX_ATTEMPTS) {
        throw new LlamaParseError({
          phase,
          status: res.status,
          attempts: attempt,
          jobId: ctx.jobId,
          tier: ctx.tier,
          bodyExcerpt,
          retryable,
          message:
            res.status === 401 || res.status === 403
              ? "Authentication failed — kiểm tra LLAMA_CLOUD_API_KEY"
              : res.status === 402
                ? "Hết credit LlamaParse — nạp thêm tại cloud.llamaindex.ai"
                : res.status === 429
                  ? "Rate-limited bởi LlamaParse"
                  : `HTTP ${res.status}`,
        });
      }
      // Honor Retry-After if present
      const ra = Number(res.headers.get("retry-after"));
      const wait = !Number.isNaN(ra) && ra > 0
        ? ra * 1000
        : HTTP_BACKOFF_BASE_MS * Math.pow(2, attempt - 1);
      console.warn(
        `[llamaparse] ${phase} ${res.status} attempt ${attempt}/${HTTP_MAX_ATTEMPTS} — retry in ${wait}ms` +
          (ctx.jobId ? ` job=${ctx.jobId}` : ""),
      );
      lastErr = new Error(`HTTP ${res.status}: ${bodyExcerpt.slice(0, 120)}`);
      await sleep(wait);
    } catch (e) {
      if (e instanceof LlamaParseError) throw e;
      lastErr = e;
      if (attempt >= HTTP_MAX_ATTEMPTS) {
        throw new LlamaParseError({
          phase,
          attempts: attempt,
          jobId: ctx.jobId,
          tier: ctx.tier,
          retryable: true,
          cause: e,
          message: `Network error: ${(e as Error)?.message || "unknown"}`,
        });
      }
      const wait = HTTP_BACKOFF_BASE_MS * Math.pow(2, attempt - 1);
      console.warn(
        `[llamaparse] ${phase} network error attempt ${attempt}/${HTTP_MAX_ATTEMPTS} — retry in ${wait}ms: ${(e as Error)?.message}`,
      );
      await sleep(wait);
    }
  }
  throw new LlamaParseError({
    phase,
    attempts: attempt,
    jobId: ctx.jobId,
    tier: ctx.tier,
    cause: lastErr,
    message: "Exhausted retries",
  });
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

  const res = await fetchWithRetry(
    "upload",
    `${BASE_URL}/api/v1/parsing/upload`,
    { method: "POST", headers: authHeaders(), body: form },
    { tier },
  );
  const json = (await res.json().catch(() => ({}))) as { id?: string };
  if (!json.id) {
    throw new LlamaParseError({
      phase: "upload",
      attempts: 1,
      tier,
      message: "Response did not contain a job id",
      bodyExcerpt: JSON.stringify(json).slice(0, 200),
    });
  }
  return json.id;
}

async function waitForJob(jobId: string, timeoutMs: number, tier: LlamaParseTier): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let consecutivePollErrors = 0;
  while (Date.now() < deadline) {
    try {
      const res = await fetchWithRetry(
        "poll",
        `${BASE_URL}/api/v1/parsing/job/${jobId}`,
        { headers: authHeaders() },
        { jobId, tier },
      );
      const json = (await res.json().catch(() => ({}))) as { status?: string; error_message?: string };
      const status = (json.status || "").toUpperCase();
      if (status === "SUCCESS") return;
      if (status === "ERROR" || status === "CANCELLED" || status === "FAILED") {
        throw new LlamaParseError({
          phase: "poll",
          attempts: 1,
          jobId,
          tier,
          message: `Job ended with status ${status}${json.error_message ? `: ${json.error_message}` : ""}`,
        });
      }
      consecutivePollErrors = 0;
    } catch (e) {
      if (e instanceof LlamaParseError && !e.retryable) throw e;
      consecutivePollErrors++;
      if (consecutivePollErrors >= 3) throw e;
    }
    await sleep(POLL_INTERVAL_MS);
  }
  throw new LlamaParseError({
    phase: "poll",
    attempts: 1,
    jobId,
    tier,
    message: `Timed out after ${timeoutMs}ms — file quá dài hoặc LlamaParse đang chậm`,
  });
}

async function fetchMarkdown(jobId: string, tier: LlamaParseTier): Promise<string> {
  const res = await fetchWithRetry(
    "fetch_markdown",
    `${BASE_URL}/api/v1/parsing/job/${jobId}/result/markdown`,
    { headers: authHeaders() },
    { jobId, tier },
  );
  const json = (await res.json().catch(() => ({}))) as { markdown?: string };
  return json.markdown || "";
}

async function fetchPages(jobId: string, tier: LlamaParseTier): Promise<string[]> {
  try {
    const res = await fetchWithRetry(
      "fetch_pages",
      `${BASE_URL}/api/v1/parsing/job/${jobId}/result/json`,
      { headers: authHeaders() },
      { jobId, tier },
    );
    const json = (await res.json().catch(() => ({}))) as {
      pages?: Array<{ md?: string; text?: string }>;
    };
    if (!Array.isArray(json.pages)) return [];
    return json.pages.map((p) => p.md || p.text || "");
  } catch (e) {
    // per-page JSON is optional — log and continue with markdown-only
    console.warn(`[llamaparse] fetch_pages failed (non-fatal): ${(e as Error)?.message}`);
    return [];
  }
}

export type ParseResult = {
  markdown: string;
  pages: string[];
  pageCount: number;
  tierUsed: LlamaParseTier;
};

/**
 * Parse a file via LlamaParse. Retries once on permanent failure by
 * downgrading `balanced → fast` (or `premium → balanced → fast`).
 * All errors are LlamaParseError with phase/status/jobId/attempts.
 */
export async function parseDocument(opts: {
  fileBase64: string;
  mimeType: string;
  filename?: string;
  tier?: LlamaParseTier;
}): Promise<ParseResult> {
  const fileBuf = Buffer.from(opts.fileBase64, "base64");
  const timeoutMs = computeTimeoutMs(fileBuf.byteLength);
  const startTier = opts.tier || "balanced";
  const tiers: LlamaParseTier[] = [startTier];
  if (startTier === "premium") tiers.push("balanced", "fast");
  else if (startTier === "balanced") tiers.push("fast");

  let lastErr: LlamaParseError | undefined;
  for (const tier of tiers) {
    try {
      const jobId = await uploadJob(
        fileBuf,
        opts.mimeType,
        opts.filename || "document",
        tier,
      );
      await waitForJob(jobId, timeoutMs, tier);
      const [markdown, pages] = await Promise.all([
        fetchMarkdown(jobId, tier),
        fetchPages(jobId, tier),
      ]);
      return {
        markdown,
        pages,
        pageCount: pages.length || (markdown ? 1 : 0),
        tierUsed: tier,
      };
    } catch (e) {
      const err = e instanceof LlamaParseError
        ? e
        : new LlamaParseError({
            phase: "upload",
            attempts: 1,
            tier,
            cause: e,
            message: (e as Error)?.message || "Unknown error",
          });
      console.warn(`[llamaparse] tier=${tier} failed:`, err.message);
      lastErr = err;
      // Don't downgrade for non-retryable auth/credit errors
      if (err.status === 401 || err.status === 403 || err.status === 402) break;
    }
  }
  throw lastErr || new LlamaParseError({ phase: "upload", attempts: 0, message: "Unknown failure" });
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
