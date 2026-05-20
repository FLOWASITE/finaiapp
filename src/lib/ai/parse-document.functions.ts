import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { generateText, Output } from "ai";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveActiveModel } from "@/lib/ai-gateway.server";
import {
  isLlamaParseEnabled,
  parseDocument as llamaParseDocument,
} from "@/lib/ai/llamaparse.server";
import { extractPdfText } from "@/lib/ai/pdf-text.server";
import { hashBase64, readParseCache, writeParseCache } from "@/lib/ai/parse-cache.server";

const InputSchema = z.object({
  fileBase64: z.string().min(1),
  mimeType: z.string().min(3).max(100),
  filename: z.string().max(255).optional(),
  kind: z.enum(["purchase_invoice", "bank_statement", "cash_voucher", "auto"]).default("auto"),
});

// ---------- Schemas ----------------------------------------------------

const PurchaseInvoiceSchema = z.object({
  vendor_name: z.string().nullable(),
  vendor_tax_id: z.string().nullable(),
  invoice_no: z.string().nullable(),
  issue_date: z.string().nullable().describe("YYYY-MM-DD"),
  currency: z.string().nullable(),
  subtotal: z.number().nullable(),
  vat_amount: z.number().nullable(),
  total: z.number().nullable(),
  lines: z
    .array(
      z.object({
        description: z.string(),
        qty: z.number().nullable(),
        unit_price: z.number().nullable(),
        amount: z.number().nullable(),
        vat_rate: z.number().nullable(),
      }),
    )
    .default([]),
  notes: z.string().nullable(),
});

const BankTxnSchema = z.object({
  date: z.string().describe("YYYY-MM-DD"),
  value_date: z.string().nullable().describe("YYYY-MM-DD"),
  description: z.string(),
  debit: z.number().nullable().describe("Số tiền ghi NỢ (chi ra), dương"),
  credit: z.number().nullable().describe("Số tiền ghi CÓ (thu vào), dương"),
  balance: z.number().nullable(),
  ref_no: z.string().nullable(),
  counterparty: z.string().nullable(),
});

const BankStatementSchema = z.object({
  account_no: z.string().nullable(),
  account_holder: z.string().nullable(),
  bank_name: z.string().nullable(),
  currency: z.string().nullable().describe("ISO code, e.g. VND"),
  period_from: z.string().nullable().describe("YYYY-MM-DD"),
  period_to: z.string().nullable().describe("YYYY-MM-DD"),
  opening_balance: z.number().nullable(),
  closing_balance: z.number().nullable(),
  transactions: z.array(BankTxnSchema).default([]),
});

const BankTxnsOnlySchema = z.object({
  transactions: z.array(BankTxnSchema).default([]),
});

const CashVoucherSchema = z.object({
  voucher_type: z.enum(["receipt", "payment", "other"]).nullable().describe("phiếu thu | phiếu chi | khác"),
  voucher_no: z.string().nullable(),
  date: z.string().nullable().describe("YYYY-MM-DD"),
  party_name: z.string().nullable(),
  party_tax_id: z.string().nullable(),
  amount: z.number().nullable(),
  currency: z.string().nullable(),
  reason: z.string().nullable(),
  account_debit: z.string().nullable(),
  account_credit: z.string().nullable(),
});

const KindClassifySchema = z.object({
  kind: z.enum(["purchase_invoice", "bank_statement", "cash_voucher", "unknown"]),
});

// ---------- Prompts ----------------------------------------------------

const PROMPTS: Record<string, string> = {
  purchase_invoice:
    "Trích xuất dữ liệu **hoá đơn mua** (hoá đơn GTGT/đầu vào) từ tài liệu. Trả về JSON theo schema. Nếu không thấy thông tin, để null.",
  bank_statement:
    "Trích xuất **toàn bộ giao dịch** trong **sao kê ngân hàng** từ tài liệu. Trả JSON theo schema. Số tiền là VND, không dấu phẩy/chấm phân cách hàng nghìn, không dấu âm — phân biệt Nợ/Có vào hai cột debit/credit.",
  cash_voucher:
    "Trích xuất **phiếu thu/chi tiền mặt** từ tài liệu. voucher_type: receipt=phiếu thu, payment=phiếu chi.",
  auto: "",
};

const PROMPT_TAIL =
  "\n\nCHỈ trả về JSON hợp lệ. Số tiền là số (không dấu phẩy/chấm phân cách hàng nghìn). Thiếu thông tin thì dùng null.";

function extractJSON(raw: string): any | null {
  if (!raw) return null;
  let s = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  if (!s.startsWith("{") && !s.startsWith("[")) {
    const o = s.indexOf("{");
    const a = s.indexOf("[");
    const isArr = a !== -1 && (o === -1 || a < o);
    const start = isArr ? a : o;
    const end = isArr ? s.lastIndexOf("]") : s.lastIndexOf("}");
    if (start === -1 || end <= start) return null;
    s = s.slice(start, end + 1);
  }
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function schemaFor(kind: string) {
  if (kind === "purchase_invoice") return PurchaseInvoiceSchema;
  if (kind === "bank_statement") return BankStatementSchema;
  if (kind === "cash_voucher") return CashVoucherSchema;
  return null;
}

// ---------- Source acquisition ----------------------------------------

type LlamaParseErrorInfo = {
  phase: string;
  status?: number;
  attempts: number;
  jobId?: string;
  tier?: string;
  message: string;
  bodyExcerpt?: string;
};

type Source =
  | {
      kind: "markdown";
      markdown: string;
      pages: string[];
      parser: string;
      pageCount: number;
      llamaError?: LlamaParseErrorInfo;
    }
  | {
      kind: "vision";
      parser: "vision";
      pageCount: number;
      llamaError?: LlamaParseErrorInfo;
    };

type TierChoice = { tier: "fast" | "balanced" | "premium"; reason: string };

/**
 * Auto-pick LlamaParse tier theo loại tài liệu + độ dài.
 * - fast (~$0.001/page): chứng từ ngắn, đơn giản (phiếu thu/chi, hoá đơn 1–2 trang).
 * - balanced (~$0.003/page): mặc định cho hoá đơn dài, sao kê (đã chunking).
 * - premium (~$0.045/page, agent mode): bảng rất phức tạp; auto KHÔNG tự lên premium
 *   để tránh hoá đơn $$. User có thể chỉ định thủ công nếu cần.
 */
function pickLlamaTier(
  kind: "purchase_invoice" | "bank_statement" | "cash_voucher" | "auto",
  mimeType: string,
  fileBytes: number,
  pageCount: number | null,
): TierChoice {
  const sizeKB = Math.round(fileBytes / 1024);
  const pagesLabel = pageCount != null ? `${pageCount}p` : `${sizeKB}KB`;

  if (kind === "cash_voucher") {
    return { tier: "fast", reason: `cash_voucher → fast (${pagesLabel})` };
  }

  if (kind === "purchase_invoice") {
    const short = (pageCount != null && pageCount <= 2) || (pageCount == null && fileBytes < 400_000);
    return short
      ? { tier: "fast", reason: `invoice ngắn → fast (${pagesLabel})` }
      : { tier: "balanced", reason: `invoice dài → balanced (${pagesLabel})` };
  }

  if (kind === "bank_statement") {
    // Sao kê đã có chunking; balanced đủ cho bảng. >50 trang vẫn balanced để không bùng chi phí.
    return { tier: "balanced", reason: `bank_statement → balanced (${pagesLabel})` };
  }

  // auto / unknown
  if (mimeType.startsWith("image/")) {
    return { tier: "fast", reason: `image → fast (${sizeKB}KB)` };
  }
  if ((pageCount != null && pageCount <= 2) || (pageCount == null && fileBytes < 300_000)) {
    return { tier: "fast", reason: `auto + ngắn → fast (${pagesLabel})` };
  }
  return { tier: "balanced", reason: `auto → balanced (${pagesLabel})` };
}

async function acquireSource(
  fileBase64: string,
  mimeType: string,
  filename: string | undefined,
  kind: "purchase_invoice" | "bank_statement" | "cash_voucher" | "auto",
): Promise<{ source: Source; parserMs: number; tierChoice?: TierChoice }> {
  const start = Date.now();
  const isPdf = mimeType === "application/pdf";
  const fileBytes = Math.floor((fileBase64.length * 3) / 4);
  let knownPageCount: number | null = null;

  // 1) Try unpdf text-layer for digital PDFs (free, in-Worker)
  if (isPdf) {
    try {
      const t = await extractPdfText(fileBase64);
      knownPageCount = t.pages || null;
      if (t.rich) {
        return {
          source: {
            kind: "markdown",
            markdown: t.text,
            pages: [],
            parser: "unpdf",
            pageCount: t.pages,
          },
          parserMs: Date.now() - start,
        };
      }
    } catch (e) {
      console.warn("[parse-document] unpdf failed:", (e as Error)?.message);
    }
  }

  // 2) LlamaParse for PDF/image/office docs (if configured)
  const llamaCandidate =
    isPdf ||
    mimeType.startsWith("image/") ||
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (llamaCandidate && isLlamaParseEnabled()) {
    const tierChoice = pickLlamaTier(kind, mimeType, fileBytes, knownPageCount);
    console.log(`[parse-document] LlamaParse tier=${tierChoice.tier} — ${tierChoice.reason}`);
    try {
      const r = await llamaParseDocument({
        fileBase64,
        mimeType,
        filename,
        tier: tierChoice.tier,
      });
      if (r.markdown && r.markdown.trim().length > 20) {
        return {
          source: {
            kind: "markdown",
            markdown: r.markdown,
            pages: r.pages,
            parser: `llamaparse:${r.tierUsed}`,
            pageCount: r.pageCount || knownPageCount || 0,
          },
          parserMs: Date.now() - start,
          tierChoice,
        };
      }
    } catch (e) {
      console.warn("[parse-document] LlamaParse failed, falling back to vision:", (e as Error)?.message);
    }
  }

  // 3) Vision fallback
  return {
    source: { kind: "vision", parser: "vision", pageCount: knownPageCount || 0 },
    parserMs: Date.now() - start,
  };
}

// ---------- Bank statement chunking -----------------------------------

const BANK_CHUNK_PAGES = 8;

async function structureBankStatement(
  source: Source,
  textModel: any,
  visionModel: any,
  fileBuf: Buffer,
  mimeType: string,
): Promise<any> {
  // Vision path: single shot
  if (source.kind === "vision") {
    const r = await generateText({
      model: visionModel,
      output: Output.object({ schema: BankStatementSchema as any }),
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: PROMPTS.bank_statement + PROMPT_TAIL },
            { type: "file", data: fileBuf, mediaType: mimeType } as any,
          ],
        },
      ],
    });
    return (r as any).output;
  }

  // Markdown path
  const pages = source.pages && source.pages.length > 0 ? source.pages : null;

  // Short statement (or no page breakdown) → single shot with full schema
  if (!pages || pages.length <= BANK_CHUNK_PAGES) {
    const r = await generateText({
      model: textModel,
      output: Output.object({ schema: BankStatementSchema as any }),
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
                PROMPTS.bank_statement +
                PROMPT_TAIL +
                "\n\nNội dung sao kê (markdown):\n\n```markdown\n" +
                source.markdown +
                "\n```",
            },
          ],
        },
      ],
    });
    return (r as any).output;
  }

  // Long statement → chunk
  const chunks: string[] = [];
  for (let i = 0; i < pages.length; i += BANK_CHUNK_PAGES) {
    chunks.push(pages.slice(i, i + BANK_CHUNK_PAGES).join("\n\n---PAGE BREAK---\n\n"));
  }

  // Header info from first chunk
  const headerPromise = generateText({
    model: textModel,
    output: Output.object({
      schema: BankStatementSchema.omit({ transactions: true }).extend({
        transactions: z.array(BankTxnSchema).default([]),
      }) as any,
    }),
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text:
              PROMPTS.bank_statement +
              PROMPT_TAIL +
              "\n\nĐây là phần đầu sao kê — trích metadata (account_no, bank_name, period, opening/closing nếu có) + các giao dịch trong phần này:\n\n```markdown\n" +
              chunks[0] +
              "\n```",
          },
        ],
      },
    ],
  });

  const restPromises = chunks.slice(1).map((chunk, idx) =>
    generateText({
      model: textModel,
      output: Output.object({ schema: BankTxnsOnlySchema as any }),
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
                "Trích toàn bộ giao dịch trong đoạn sao kê sau (phần " +
                (idx + 2) +
                "/" +
                chunks.length +
                "). Số tiền là VND, dương. Bỏ qua header/footer trùng lặp giữa các trang.\n\n```markdown\n" +
                chunk +
                "\n```",
            },
          ],
        },
      ],
    }),
  );

  const [headerRes, ...restRes] = await Promise.all([headerPromise, ...restPromises]);
  const header: any = (headerRes as any).output;
  const allTxns: any[] = [...(header.transactions || [])];
  for (const r of restRes) {
    const out: any = (r as any).output;
    if (Array.isArray(out?.transactions)) allTxns.push(...out.transactions);
  }

  // Validate: sum(credit) - sum(debit) ~= closing - opening
  let validation: any = null;
  if (typeof header.opening_balance === "number" && typeof header.closing_balance === "number") {
    const credit = allTxns.reduce((s, t) => s + (Number(t.credit) || 0), 0);
    const debit = allTxns.reduce((s, t) => s + (Number(t.debit) || 0), 0);
    const expected = header.closing_balance - header.opening_balance;
    const actual = credit - debit;
    const diff = Math.abs(expected - actual);
    validation = { expected, actual, diff, ok: diff < 1 };
  }

  return {
    ...header,
    transactions: allTxns,
    _validation: validation,
    _chunks: chunks.length,
  };
}

// ---------- Core --------------------------------------------------------

export async function parseFileCore(opts: {
  fileBase64: string;
  mimeType: string;
  filename?: string;
  kind: "purchase_invoice" | "bank_statement" | "cash_voucher" | "auto";
  supabase?: any;
  userId?: string;
}) {
  const fileBuf = Buffer.from(opts.fileBase64, "base64");
  const fileHash = hashBase64(opts.fileBase64);

  // ---- 0. Cache check (skip for `auto` since dispatch may pick different kind)
  if (opts.supabase && opts.kind !== "auto") {
    const cached = await readParseCache(opts.supabase, fileHash, opts.kind);
    if (cached) {
      return {
        kind: opts.kind,
        uploadId: null,
        parsed: cached.parsed,
        parser: cached.parser_used || "cache",
        cached: true,
        pages: cached.pages,
      };
    }
  }

  // ---- 1. Source acquisition
  const { source, parserMs } = await acquireSource(
    opts.fileBase64,
    opts.mimeType,
    opts.filename,
    opts.kind,
  );

  // ---- 2. Models
  const { model: visionModel } = await resolveActiveModel("parse", "google/gemini-2.5-pro");
  const { model: textModel } = await resolveActiveModel("parse", "google/gemini-3-flash-preview");

  // ---- 3. Auto kind classification
  let effectiveKind = opts.kind;
  if (effectiveKind === "auto") {
    try {
      const text =
        source.kind === "markdown"
          ? source.markdown.slice(0, 6000)
          : "";
      const messages =
        source.kind === "markdown"
          ? [
              {
                role: "user" as const,
                content: [
                  {
                    type: "text" as const,
                    text:
                      "Phân loại tài liệu sau là loại nào trong: purchase_invoice (hoá đơn mua), bank_statement (sao kê ngân hàng), cash_voucher (phiếu thu/chi), unknown.\n\n```\n" +
                      text +
                      "\n```",
                  },
                ],
              },
            ]
          : [
              {
                role: "user" as const,
                content: [
                  {
                    type: "text" as const,
                    text:
                      "Phân loại tài liệu là: purchase_invoice / bank_statement / cash_voucher / unknown.",
                  },
                  { type: "file" as const, data: fileBuf, mediaType: opts.mimeType } as any,
                ],
              },
            ];
      const r = await generateText({
        model: source.kind === "markdown" ? textModel : visionModel,
        output: Output.object({ schema: KindClassifySchema as any }),
        messages,
      });
      const k = (r as any).output?.kind;
      if (k && k !== "unknown") {
        effectiveKind = k;
      }
    } catch (e) {
      console.warn("[parse-document] auto classify failed:", (e as Error)?.message);
    }
  }

  // ---- 4. Structurer
  const structStart = Date.now();
  let parsed: any;

  try {
    if (effectiveKind === "bank_statement") {
      parsed = await structureBankStatement(source, textModel, visionModel, fileBuf, opts.mimeType);
    } else {
      const schema = schemaFor(effectiveKind);
      const promptHead = PROMPTS[effectiveKind] || "Trích xuất dữ liệu từ tài liệu.";
      const messages =
        source.kind === "markdown"
          ? [
              {
                role: "user" as const,
                content: [
                  {
                    type: "text" as const,
                    text:
                      promptHead +
                      PROMPT_TAIL +
                      "\n\nNội dung tài liệu (markdown):\n\n```markdown\n" +
                      source.markdown +
                      "\n```",
                  },
                ],
              },
            ]
          : [
              {
                role: "user" as const,
                content: [
                  { type: "text" as const, text: promptHead + PROMPT_TAIL },
                  { type: "file" as const, data: fileBuf, mediaType: opts.mimeType } as any,
                ],
              },
            ];
      const model = source.kind === "markdown" ? textModel : visionModel;
      if (schema) {
        const r = await generateText({
          model,
          output: Output.object({ schema: schema as any }),
          messages,
        });
        parsed = (r as any).output;
      } else {
        const r = await generateText({ model, messages });
        parsed = extractJSON(r.text) ?? { raw: r.text };
      }
    }
  } catch (err: any) {
    console.warn("[parse-document] structurer failed:", err?.message);
    // last-ditch vision retry
    if (source.kind === "markdown") {
      const r = await generateText({
        model: visionModel,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: (PROMPTS[effectiveKind] || "") + PROMPT_TAIL },
              { type: "file", data: fileBuf, mediaType: opts.mimeType } as any,
            ],
          },
        ],
      });
      parsed = extractJSON(r.text) ?? { raw: r.text, _schemaError: err?.message };
    } else {
      throw err;
    }
  }
  const structurerMs = Date.now() - structStart;

  // ---- 5. Write to cache (skip if `auto` resolved to nothing)
  if (opts.supabase && effectiveKind !== "auto") {
    await writeParseCache(opts.supabase, fileHash, effectiveKind, parsed, source.parser, source.pageCount || null);
  }

  // ---- 6. Persist upload (best-effort)
  let uploadId: string | null = null;
  if (opts.supabase && opts.userId) {
    try {
      const path = `ai-uploads/${opts.userId}/${Date.now()}-${opts.filename || "file"}`;
      await opts.supabase.storage.from("invoices").upload(path, fileBuf, {
        contentType: opts.mimeType,
        upsert: false,
      });
      const { data: row } = await opts.supabase
        .from("ai_uploads")
        .insert({
          user_id: opts.userId,
          file_path: path,
          mime_type: opts.mimeType,
          filename: opts.filename || null,
          kind: effectiveKind,
          parsed: typeof parsed === "string" ? { raw: parsed } : parsed,
          parser_used: source.parser,
          parser_ms: parserMs,
          structurer_ms: structurerMs,
          pages: source.pageCount || null,
          file_hash: fileHash,
        })
        .select("id")
        .maybeSingle();
      uploadId = row?.id ?? null;
    } catch {
      // best-effort
    }
  }

  return {
    kind: effectiveKind,
    uploadId,
    parsed,
    parser: source.parser,
    cached: false,
    pages: source.pageCount || null,
    timings: { parserMs, structurerMs },
  };
}

export const parseDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => InputSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    return parseFileCore({ ...data, supabase, userId });
  });
