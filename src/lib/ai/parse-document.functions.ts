import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { generateText } from "ai";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveActiveModel, resolveAgentModel } from "@/lib/ai-gateway.server";
import {
  isLlamaParseEnabled,
  parseDocument as llamaParseDocument,
} from "@/lib/ai/llamaparse.server";
import { extractPdfText } from "@/lib/ai/pdf-text.server";
import { hashBase64, readParseCache, writeParseCache } from "@/lib/ai/parse-cache.server";
import { parseEinvoiceXml } from "@/lib/einvoice-xml-parser";
import {
  classifyLine,
  summarizeInvoiceKind,
  vsicToKindHint,
  accountToKind,
  type LineKind,
  type ClassifyContext,
} from "@/lib/ai/classify-line";
import { resolveVendorLine } from "@/lib/items/resolver.server";

const InputSchema = z.object({
  fileBase64: z.string().min(1),
  mimeType: z.string().min(3).max(100),
  filename: z.string().max(255).optional(),
  kind: z.enum(["purchase_invoice", "bank_statement", "cash_voucher", "auto"]).default("auto"),
});

const UploadOnlyInputSchema = InputSchema.pick({
  fileBase64: true,
  mimeType: true,
  filename: true,
  kind: true,
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
        unit: z.string().nullable().describe("Đơn vị tính (ĐVT): cái, hộp, kg, lít, lần, tháng, bộ…"),
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

function appendJsonOnlyInstruction(messages: any[]): any[] {
  return messages.map((message, index) => {
    if (index !== messages.length - 1) return message;
    const reminder =
      "\n\nBẮT BUỘC chỉ trả về một JSON object hợp lệ, không markdown, không giải thích, không thêm chữ ngoài JSON.";
    if (Array.isArray(message.content)) {
      return { ...message, content: [...message.content, { type: "text", text: reminder }] };
    }
    return { ...message, content: `${message.content || ""}${reminder}` };
  });
}

function withSchemaWarning(value: any, warning: string, rawText?: string) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return { ...value, _schemaWarning: warning, ...(rawText ? { _rawText: rawText.slice(0, 12000) } : {}) };
  }
  return { raw: value ?? rawText ?? null, _schemaWarning: warning };
}

function normalizeFileMime(mimeType: string, filename?: string): string {
  const name = (filename || "").toLowerCase();
  if (name.endsWith(".pdf")) return "application/pdf";
  if (name.endsWith(".xml") && !mimeType.toLowerCase().includes("xml")) return "application/xml";
  return mimeType || "application/octet-stream";
}

function toNullableString(value: any): string | null {
  if (value == null) return null;
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return null;
}

function toNullableNumber(value: any): number | null {
  if (value == null || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function normalizePurchaseInvoice(value: any, rawText?: string | null, parserNote?: string | null) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const lines = Array.isArray(source.lines)
    ? source.lines.map((line: any) => {
        const base = {
          description: toNullableString(line?.description) || "Hàng hoá / dịch vụ",
          qty: toNullableNumber(line?.qty),
          unit: toNullableString(line?.unit),
          unit_price: toNullableNumber(line?.unit_price),
          amount: toNullableNumber(line?.amount),
          vat_rate: toNullableNumber(line?.vat_rate),
        };
        return { ...base, classification: classifyLine(base) };
      })
    : [];
  const classification_summary = summarizeInvoiceKind(lines);
  return {
    ...source,
    vendor_name: toNullableString(source.vendor_name),
    vendor_tax_id: toNullableString(source.vendor_tax_id),
    invoice_no: toNullableString(source.invoice_no),
    issue_date: toNullableString(source.issue_date),
    currency: toNullableString(source.currency) || "VND",
    subtotal: toNullableNumber(source.subtotal),
    vat_amount: toNullableNumber(source.vat_amount),
    total: toNullableNumber(source.total),
    lines,
    classification_summary,
    notes: toNullableString(source.notes),
    ...(rawText ? { _rawText: rawText.slice(0, 12000) } : {}),
    ...(parserNote ? { _parserNotes: parserNote } : {}),
  };
}

function isEmptyPurchaseInvoice(parsed: any): boolean {
  return !parsed?.vendor_name && !parsed?.invoice_no && !parsed?.issue_date &&
    !(Number(parsed?.subtotal) > 0) && !(Number(parsed?.total) > 0) &&
    !(Array.isArray(parsed?.lines) && parsed.lines.length > 0);
}

async function generateJsonBestEffort(opts: {
  model: any;
  messages: any[];
  schema?: z.ZodTypeAny | null;
  fallback: any;
  label: string;
}) {
  const r = await generateText({
    model: opts.model,
    messages: appendJsonOnlyInstruction(opts.messages),
  });
  const json = extractJSON(r.text);
  if (json == null) {
    console.warn(`[parse-document] ${opts.label} returned no JSON`);
    return withSchemaWarning(opts.fallback, "AI returned no valid JSON", r.text);
  }
  const normalized = opts.label === "purchase_invoice" ? normalizePurchaseInvoice(json) : json;
  if (!opts.schema) return json;
  const checked = opts.schema.safeParse(normalized);
  if (checked.success) return checked.data;
  console.warn(`[parse-document] ${opts.label} schema mismatch:`, checked.error.message);
  return withSchemaWarning(normalized, "Kết quả AI chưa khớp hoàn toàn schema, đã chuẩn hóa dữ liệu tốt nhất có thể.");
}

function schemaFor(kind: string) {
  if (kind === "purchase_invoice") return PurchaseInvoiceSchema;
  if (kind === "bank_statement") return BankStatementSchema;
  if (kind === "cash_voucher") return CashVoucherSchema;
  return null;
}

function isXmlFile(mimeType: string, filename?: string): boolean {
  const m = (mimeType || "").toLowerCase();
  const f = (filename || "").toLowerCase();
  return m.includes("xml") || f.endsWith(".xml");
}

function parsedXmlToPurchaseInvoice(parsed: ReturnType<typeof parseEinvoiceXml>) {
  const lines = parsed.lines
    .filter((line) => line.kind === "item")
    .map((line) => {
      const base = {
        description: line.description || "Hàng hoá / dịch vụ",
        qty: line.qty || 1,
        unit: line.unit || null,
        unit_price: line.unit_price || null,
        amount: line.amount || null,
        vat_rate: line.vat_rate,
      };
      return { ...base, classification: classifyLine(base) };
    });
  const classification_summary = summarizeInvoiceKind(lines);
  return {
    vendor_name: parsed.seller.name || null,
    vendor_tax_id: parsed.seller.tax_id || null,
    invoice_no: parsed.invoice_no || null,
    issue_date: parsed.issue_date,
    currency: parsed.currency || "VND",
    subtotal: parsed.totals.subtotal || null,
    vat_amount: parsed.totals.vat_amount || null,
    total: parsed.totals.total || null,
    lines,
    classification_summary,
    notes: parsed.cqt_code ? `XML HĐĐT, mã CQT: ${parsed.cqt_code}` : "XML HĐĐT",
    // Extra fields (ignored by downstream validators) used by the chat
    // preview to render the original e-invoice as a paper-style template.
    _signed: parsed.cqt_signed || parsed.seller_signed,
    _einvoice: {
      series: parsed.series || parsed.series_short || null,
      template: parsed.template || null,
      invoice_no: parsed.invoice_no || null,
      issue_date: parsed.issue_date,
      currency: parsed.currency || "VND",
      cqt_code: parsed.cqt_code,
      cqt_signed: parsed.cqt_signed,
      seller_signed: parsed.seller_signed,
      adjustment_kind: parsed.adjustment_kind,
      seller: parsed.seller,
      buyer: parsed.buyer,
      lines: parsed.lines
        .filter((l) => l.kind === "item")
        .map((l) => ({
          description: l.description,
          unit: l.unit,
          qty: l.qty,
          unit_price: l.unit_price,
          amount: l.amount,
          vat_rate: l.vat_rate,
          vat_amount: l.vat_amount,
        })),
      totals: {
        subtotal: parsed.totals.subtotal,
        vat_amount: parsed.totals.vat_amount,
        discount_total: parsed.totals.discount_total,
        total: parsed.totals.total,
        total_in_words: parsed.totals.total_in_words,
      },
    },
  };
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
  const normalizedMimeType = normalizeFileMime(mimeType, filename);
  const isPdf = normalizedMimeType === "application/pdf";
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
      const tierChoice = pickLlamaTier(kind, normalizedMimeType, fileBytes, knownPageCount);
    console.log(`[parse-document] LlamaParse tier=${tierChoice.tier} — ${tierChoice.reason}`);
    try {
      const r = await llamaParseDocument({
        fileBase64,
          mimeType: normalizedMimeType,
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
    } catch (e: any) {
      const info: LlamaParseErrorInfo = {
        phase: e?.phase ?? "unknown",
        status: e?.status,
        attempts: e?.attempts ?? 0,
        jobId: e?.jobId,
        tier: e?.tier,
        message: e?.message || String(e),
        bodyExcerpt: e?.bodyExcerpt,
      };
      console.warn("[parse-document] LlamaParse failed, falling back to vision:", info.message);
      return {
        source: {
          kind: "vision",
          parser: "vision",
          pageCount: knownPageCount || 0,
          llamaError: info,
        },
        parserMs: Date.now() - start,
        tierChoice,
      };
    }
  }

  // 3) Vision fallback (no LlamaParse attempted)
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
    return generateJsonBestEffort({
      model: visionModel,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: PROMPTS.bank_statement + PROMPT_TAIL },
            { type: "file", data: fileBuf, mediaType: mimeType } as any,
          ],
        },
      ],
      schema: BankStatementSchema,
      fallback: { transactions: [] },
      label: "bank_statement vision",
    });
  }

  // Markdown path
  const pages = source.pages && source.pages.length > 0 ? source.pages : null;

  // Short statement (or no page breakdown) → single shot with full schema
  if (!pages || pages.length <= BANK_CHUNK_PAGES) {
    return generateJsonBestEffort({
      model: textModel,
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
      schema: BankStatementSchema,
      fallback: { transactions: [] },
      label: "bank_statement markdown",
    });
  }

  // Long statement → chunk
  const chunks: string[] = [];
  for (let i = 0; i < pages.length; i += BANK_CHUNK_PAGES) {
    chunks.push(pages.slice(i, i + BANK_CHUNK_PAGES).join("\n\n---PAGE BREAK---\n\n"));
  }

  // Header info from first chunk
  const headerPromise = generateJsonBestEffort({
    model: textModel,
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
    schema: BankStatementSchema.omit({ transactions: true }).extend({
      transactions: z.array(BankTxnSchema).default([]),
    }),
    fallback: { transactions: [] },
    label: "bank_statement header chunk",
  });

  const restPromises = chunks.slice(1).map((chunk, idx) =>
    generateJsonBestEffort({
      model: textModel,
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
      schema: BankTxnsOnlySchema,
      fallback: { transactions: [] },
      label: `bank_statement transaction chunk ${idx + 2}`,
    }),
  );

  const [headerRes, ...restRes] = await Promise.all([headerPromise, ...restPromises]);
  const header: any = headerRes;
  const allTxns: any[] = [...(header.transactions || [])];
  for (const r of restRes) {
    const out: any = r;
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

/**
 * Upload file gốc lên Storage + tạo/lấy row ai_uploads (idempotent theo
 * user_id + file_hash + kind). Chạy NGAY khi nhận file để luôn có audit trail,
 * kể cả khi parse fail sau đó.
 */
const KIND_TO_DOC_KIND: Record<string, string> = {
  bank_statement: "bank_statement",
  purchase_invoice: "purchase_invoice",
  sales_invoice: "sales_invoice",
  cash_voucher: "cash_voucher",
  auto: "other",
};

/** Lấy MST tenant đang hoạt động của user. Trả "" nếu không có. */
async function getTenantTaxIdQuick(supabase: any, userId?: string): Promise<string> {
  try {
    if (!supabase || !userId) return "";
    const { data: prof } = await supabase
      .from("profiles").select("active_tenant_id").eq("id", userId).maybeSingle();
    const tid = prof?.active_tenant_id;
    if (!tid) return "";
    const { data: t } = await supabase
      .from("tenants").select("tax_id").eq("id", tid).maybeSingle();
    return String(t?.tax_id ?? "").replace(/\D+/g, "");
  } catch {
    return "";
  }
}

async function upsertDocumentForUpload(opts: {
  supabase: any;
  userId: string;
  uploadId: string;
  filePath: string;
  filename?: string | null;
  mimeType: string;
  kind: string;
  fileHash: string;
}): Promise<void> {
  try {
    const { data: prof } = await opts.supabase
      .from("profiles")
      .select("active_tenant_id")
      .eq("id", opts.userId)
      .maybeSingle();
    const tenantId = prof?.active_tenant_id;
    if (!tenantId) return;

    // Existing doc on same path? Just link it.
    const { data: existing } = await opts.supabase
      .from("documents")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("storage_bucket", "invoices")
      .eq("storage_path", opts.filePath)
      .maybeSingle();
    if (existing?.id) {
      await opts.supabase
        .from("documents")
        .update({ ai_upload_id: opts.uploadId })
        .eq("id", existing.id);
      return;
    }

    await opts.supabase.from("documents").insert({
      tenant_id: tenantId,
      user_id: opts.userId,
      doc_kind: KIND_TO_DOC_KIND[opts.kind] ?? "other",
      source: "ai_chat",
      storage_bucket: "invoices",
      storage_path: opts.filePath,
      original_filename: opts.filename ?? null,
      mime_type: opts.mimeType,
      checksum_sha256: opts.fileHash,
      ocr_status: "processing",
      ai_upload_id: opts.uploadId,
    });
  } catch (e: any) {
    console.warn("[parseFileCore] upsertDocumentForUpload exception:", e?.message);
  }
}

async function updateDocumentOcr(opts: {
  supabase: any;
  uploadId: string;
  status: "done" | "failed";
  parsed?: any;
  error?: string;
}): Promise<void> {
  try {
    const patch: any = { ocr_status: opts.status };
    if (opts.parsed !== undefined) patch.ocr_extracted = opts.parsed;
    if (opts.error) patch.notes = opts.error.slice(0, 500);
    await opts.supabase.from("documents").update(patch).eq("ai_upload_id", opts.uploadId);
  } catch {}
}

async function ensureUploadRow(opts: {
  supabase: any;
  userId: string;
  fileBuf: Buffer;
  fileHash: string;
  filename?: string;
  mimeType: string;
  kind: string;
}): Promise<{ uploadId: string; filePath: string | null } | null> {
  try {
    const { data: existing } = await opts.supabase
      .from("ai_uploads")
      .select("id, file_path")
      .eq("user_id", opts.userId)
      .eq("file_hash", opts.fileHash)
      .eq("kind", opts.kind)
      .maybeSingle();
    if (existing?.id) {
      // If a previous attempt failed to upload to storage (file_path null),
      // try again now so thumbnails / signed URLs work going forward.
      if (!existing.file_path) {
        const safeName0 = (opts.filename || "file").replace(/[^\w.\-]+/g, "_");
        const retryPath = `${opts.userId}/ai-uploads/${Date.now()}-${safeName0}`;
        const { error: retryErr } = await opts.supabase.storage
          .from("invoices")
          .upload(retryPath, opts.fileBuf, { contentType: opts.mimeType, upsert: false });
        if (!retryErr) {
          await opts.supabase
            .from("ai_uploads")
            .update({ file_path: retryPath })
            .eq("id", existing.id);
          await upsertDocumentForUpload({
            supabase: opts.supabase,
            userId: opts.userId,
            uploadId: existing.id,
            filePath: retryPath,
            filename: opts.filename,
            mimeType: opts.mimeType,
            kind: opts.kind,
            fileHash: opts.fileHash,
          });
          return { uploadId: existing.id, filePath: retryPath };
        }
      }
      // Ensure a document row exists too (handles legacy uploads)
      if (existing.file_path) {
        await upsertDocumentForUpload({
          supabase: opts.supabase,
          userId: opts.userId,
          uploadId: existing.id,
          filePath: existing.file_path,
          filename: opts.filename,
          mimeType: opts.mimeType,
          kind: opts.kind,
          fileHash: opts.fileHash,
        });
      }
      return { uploadId: existing.id, filePath: existing.file_path ?? null };
    }
    const safeName = (opts.filename || "file").replace(/[^\w.\-]+/g, "_");
    // IMPORTANT: storage RLS on `invoices` bucket requires the first folder
    // segment to equal auth.uid(). Putting "ai-uploads" first makes the upload
    // silently fail RLS → file_path stays null → thumbnails can't load.
    const path = `${opts.userId}/ai-uploads/${Date.now()}-${safeName}`;
    const { error: upErr } = await opts.supabase.storage
      .from("invoices")
      .upload(path, opts.fileBuf, { contentType: opts.mimeType, upsert: false });
    if (upErr) {
      console.warn("[parseFileCore] storage upload failed:", upErr.message);
    }
    const { data: row, error: insErr } = await opts.supabase
      .from("ai_uploads")
      .insert({
        user_id: opts.userId,
        file_path: upErr ? null : path,
        mime_type: opts.mimeType,
        filename: opts.filename || null,
        kind: opts.kind,
        file_hash: opts.fileHash,
        status: "uploaded",
      })
      .select("id, file_path")
      .maybeSingle();
    if (insErr) {
      console.warn("[parseFileCore] ai_uploads insert failed:", insErr.message);
      return null;
    }
    if (row?.id && row.file_path) {
      await upsertDocumentForUpload({
        supabase: opts.supabase,
        userId: opts.userId,
        uploadId: row.id,
        filePath: row.file_path,
        filename: opts.filename,
        mimeType: opts.mimeType,
        kind: opts.kind,
        fileHash: opts.fileHash,
      });
    }
    return row?.id ? { uploadId: row.id, filePath: row.file_path ?? null } : null;
  } catch (e: any) {
    console.warn("[parseFileCore] ensureUploadRow exception:", e?.message);
    return null;
  }
}

/**
 * Sau khi đã parse được hoá đơn mua, dùng MST/tên NCC để:
 *  - tra industry_code → industry_hint (ngành nghề thiên về HH/DV…)
 *  - tổng hợp lịch sử 12 tháng (theo expense_account) → historyDist
 * Rồi re-run classifyLine để các dòng được phân loại chính xác hơn khi AI
 * gặp lại cùng tên hàng từ cùng NCC.
 */
async function enrichInvoiceWithSupplierSignals(
  parsed: any,
  supabase: any,
  userId?: string,
): Promise<any> {
  try {
    if (!parsed || !supabase || !userId) return parsed;
    if (!Array.isArray(parsed.lines) || parsed.lines.length === 0) return parsed;

    const rawTax = String(parsed.vendor_tax_id ?? "").replace(/\D+/g, "");
    const vendorName = String(parsed.vendor_name ?? "").trim();
    if (!rawTax && !vendorName) return parsed;

    const { data: prof } = await supabase
      .from("profiles")
      .select("active_tenant_id")
      .eq("id", userId)
      .maybeSingle();
    const tenantId = prof?.active_tenant_id;
    if (!tenantId) return parsed;

    let sup: { id: string; industry_code: string | null } | null = null;
    if (rawTax) {
      const { data } = await supabase
        .from("suppliers")
        .select("id, industry_code")
        .eq("tenant_id", tenantId)
        .eq("tax_id", rawTax)
        .maybeSingle();
      sup = data ?? null;
    }
    if (!sup && vendorName) {
      const { data } = await supabase
        .from("suppliers")
        .select("id, industry_code")
        .eq("tenant_id", tenantId)
        .ilike("name", vendorName)
        .limit(1)
        .maybeSingle();
      sup = data ?? null;
    }

    const industry_code = sup?.industry_code ?? null;
    const industry_hint = vsicToKindHint(industry_code);

    const historyDist: Partial<Record<LineKind, number>> = {};
    if (sup?.id) {
      const since = new Date();
      since.setMonth(since.getMonth() - 12);
      const sinceDate = since.toISOString().slice(0, 10);
      const { data: hist } = await supabase
        .from("invoices")
        .select("expense_account, total")
        .eq("tenant_id", tenantId)
        .eq("supplier_id", sup.id)
        .gte("issue_date", sinceDate)
        .neq("status", "void")
        .not("expense_account", "is", null)
        .limit(300);
      for (const r of (hist ?? []) as any[]) {
        const k = accountToKind(r.expense_account);
        if (!k) continue;
        const w = Math.max(1, Math.round(Number(r.total) || 0));
        historyDist[k] = (historyDist[k] ?? 0) + w;
      }
    }

    const ctx: ClassifyContext = {
      industryHint: industry_hint?.kind ?? null,
      industryLabel: industry_hint?.label ?? null,
      historyDist: Object.keys(historyDist).length ? historyDist : null,
    };

    const newLines = parsed.lines.map((l: any) => {
      const base = {
        description: l?.description ?? null,
        qty: l?.qty ?? null,
        unit: l?.unit ?? null,
        unit_price: l?.unit_price ?? null,
        amount: l?.amount ?? null,
      };
      return { ...l, classification: classifyLine(base, ctx) };
    });

    return {
      ...parsed,
      lines: newLines,
      classification_summary: summarizeInvoiceKind(newLines),
      _supplier_signals: {
        industry_code,
        industry_hint: industry_hint?.label ?? null,
        history_dist: historyDist,
      },
    };
  } catch (e: any) {
    console.warn("[parse-document] enrichInvoiceWithSupplierSignals failed:", e?.message);
    return parsed;
  }
}

/**
 * Resolve each invoice line against the tenant's product catalog using the
 * supplier_item_mappings cache + fuzzy resolver. Attaches `_resolution`
 * (status + best candidate + top candidates) and, when status='auto', sets
 * `product_id` so downstream classifiers can pick TK 152/153/156 correctly.
 */
async function enrichInvoiceWithItemResolution(
  parsed: any,
  supabase: any,
  userId?: string,
): Promise<any> {
  try {
    if (!parsed || !supabase || !userId) return parsed;
    if (!Array.isArray(parsed.lines) || parsed.lines.length === 0) return parsed;
    const rawTax = String(parsed.vendor_tax_id ?? "").replace(/\D+/g, "");
    if (!rawTax) return parsed;

    const { data: prof } = await supabase
      .from("profiles")
      .select("active_tenant_id")
      .eq("id", userId)
      .maybeSingle();
    const tenantId = prof?.active_tenant_id;
    if (!tenantId) return parsed;

    const { data: sup } = await supabase
      .from("suppliers")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("tax_id", rawTax)
      .maybeSingle();
    if (!sup?.id) return parsed;

    const newLines = await Promise.all(
      parsed.lines.map(async (l: any) => {
        const name = String(l?.description ?? l?.name ?? "").trim();
        if (!name) return l;
        try {
          const res = await resolveVendorLine(supabase, {
            tenantId,
            supplierId: sup.id,
            rawName: name,
            rawUnit: l?.unit ?? null,
            qty: l?.qty ?? null,
            price: l?.unit_price ?? null,
          });
          const _resolution = {
            status: res.status,
            method: res.method,
            best: res.best
              ? {
                  product_id: res.best.product_id,
                  code: res.best.code,
                  name: res.best.name,
                  unit: res.best.unit,
                  score: res.best.score,
                  match_count: res.best.cached?.match_count ?? null,
                }
              : null,
            candidates: res.candidates.slice(0, 3).map((c: any) => ({
              product_id: c.product_id,
              code: c.code,
              name: c.name,
              unit: c.unit,
              score: c.score,
            })),
          };
          return {
            ...l,
            _resolution,
            product_id: res.status === "auto" && res.best ? res.best.product_id : (l.product_id ?? null),
          };
        } catch {
          return l;
        }
      }),
    );

    return { ...parsed, lines: newLines };
  } catch (e: any) {
    console.warn("[parse-document] enrichInvoiceWithItemResolution failed:", e?.message);
    return parsed;
  }
}




export type ParsePhaseEvent = {
  name: "ocr" | "extract" | "partner_match" | "rules_check";
  status: "start" | "done";
  ms?: number | null;
};

export async function parseFileCore(opts: {
  fileBase64: string;
  mimeType: string;
  filename?: string;
  kind: "purchase_invoice" | "bank_statement" | "cash_voucher" | "auto";
  supabase?: any;
  userId?: string;
  onPhase?: (phase: ParsePhaseEvent) => void;
}) {
  const emitPhase = (p: ParsePhaseEvent) => {
    try { opts.onPhase?.(p); } catch {}
  };
  const fileBuf = Buffer.from(opts.fileBase64, "base64");
  const mimeType = normalizeFileMime(opts.mimeType, opts.filename);
  const fileHash = await hashBase64(opts.fileBase64);

  // ---- 0. Upload file gốc NGAY (trước parse) - luôn có audit trail dù parse fail/cache hit.
  let uploadInfo: { uploadId: string; filePath: string | null } | null = null;
  if (opts.supabase && opts.userId) {
    uploadInfo = await ensureUploadRow({
      supabase: opts.supabase,
      userId: opts.userId,
      fileBuf,
      fileHash,
      filename: opts.filename,
      mimeType,
      kind: opts.kind,
    });
  }
  let uploadId = uploadInfo?.uploadId ?? null;

  const markFailed = async (msg: string) => {
    if (uploadId && opts.supabase) {
      try {
        await opts.supabase
          .from("ai_uploads")
          .update({ status: "failed", error: msg.slice(0, 2000) })
          .eq("id", uploadId);
        await updateDocumentOcr({ supabase: opts.supabase, uploadId, status: "failed", error: msg });
      } catch {}
    }
  };

  try {
    if (isXmlFile(mimeType, opts.filename)) {
      try {
        const parsedXml = parseEinvoiceXml(fileBuf.toString("utf8"));

        // Xác định hướng HĐ theo MST: seller=tenant → HĐ bán; buyer=tenant → HĐ mua.
        const tenantTax = await getTenantTaxIdQuick(opts.supabase, opts.userId);
        const sellerTax = String(parsedXml?.seller?.tax_id ?? "").replace(/\D+/g, "");
        const buyerTax = String(parsedXml?.buyer?.tax_id ?? "").replace(/\D+/g, "");
        let actualKind: "purchase_invoice" | "sales_invoice" = "purchase_invoice";
        if (tenantTax && sellerTax && sellerTax === tenantTax) actualKind = "sales_invoice";
        else if (tenantTax && buyerTax && buyerTax === tenantTax) actualKind = "purchase_invoice";

        let parsed = parsedXmlToPurchaseInvoice(parsedXml);
        if (actualKind === "purchase_invoice") {
          parsed = await enrichInvoiceWithSupplierSignals(parsed, opts.supabase, opts.userId);
        }
        // Đánh dấu hướng để UI/lower layers biết
        if (parsed && typeof parsed === "object") {
          (parsed as any).direction = actualKind;
        }

        if (uploadId && opts.supabase) {
          try {
            await opts.supabase
              .from("ai_uploads")
              .update({
                kind: actualKind,
                parsed,
                parser_used: "einvoice_xml",
                pages: 1,
                status: "parsed",
                error: null,
              })
              .eq("id", uploadId);
            await updateDocumentOcr({ supabase: opts.supabase, uploadId, status: "done", parsed });
            // Sync doc_kind cho documents row (mặc định lúc tạo dùng opts.kind, có thể lệch hướng)
            try {
              await opts.supabase
                .from("documents")
                .update({ doc_kind: actualKind })
                .eq("ai_upload_id", uploadId);
            } catch {}
          } catch {}
        }
        if (opts.supabase) {
          await writeParseCache(opts.supabase, fileHash, actualKind, parsed, "einvoice_xml", 1);
        }
        return {
          kind: actualKind,
          uploadId,
          parsed,
          parser: "einvoice_xml",
          cached: false,
          pages: 1,
          file_hash: fileHash,
        };
      } catch (e: any) {
        await markFailed(e?.message || "Không nhận diện được XML hoá đơn điện tử");
        throw e;
      }
    }

    // ---- 1. Cache check (skip for `auto`)
    if (opts.supabase && opts.kind !== "auto") {
      const cached = await readParseCache(opts.supabase, fileHash, opts.kind);
      if (cached) {
        let cachedParsed = opts.kind === "purchase_invoice"
          ? normalizePurchaseInvoice(cached.parsed, null, "Đọc từ cache parse trước đó.")
          : cached.parsed;
        if (opts.kind === "purchase_invoice") {
          cachedParsed = await enrichInvoiceWithSupplierSignals(cachedParsed, opts.supabase, opts.userId);
        }
        if (opts.kind === "purchase_invoice" && mimeType === "application/pdf" && isEmptyPurchaseInvoice(cachedParsed)) {
          console.warn("[parse-document] ignoring empty invoice cache for PDF, retrying parser");
        } else {
        if (uploadId) {
          try {
            await opts.supabase
              .from("ai_uploads")
              .update({
                parsed: typeof cachedParsed === "string" ? { raw: cachedParsed } : cachedParsed,
                parser_used: cached.parser_used || "cache",
                pages: cached.pages,
                status: "parsed",
                error: null,
              })
              .eq("id", uploadId);
            await updateDocumentOcr({
              supabase: opts.supabase,
              uploadId,
              status: "done",
              parsed: typeof cachedParsed === "string" ? { raw: cachedParsed } : cachedParsed,
            });
          } catch {}
        }
        return {
          kind: opts.kind,
          uploadId,
          parsed: cachedParsed,
          parser: cached.parser_used || "cache",
          cached: true,
          pages: cached.pages,
          file_hash: fileHash,
        };
        }
      }
    }

    // ---- 2. Source acquisition
    emitPhase({ name: "ocr", status: "start" });
    const { source, parserMs } = await acquireSource(
      opts.fileBase64,
      mimeType,
      opts.filename,
      opts.kind,
    );
    emitPhase({ name: "ocr", status: "done", ms: parserMs });

    // ---- 3. Models
    const { model: visionModel } = await resolveAgentModel("parse_doc_vision", "google/gemini-2.5-pro");
    const { model: textModel } = await resolveAgentModel("parse_doc_text", "google/gemini-3-flash-preview");

    // ---- 4. Auto kind classification
    let effectiveKind = opts.kind;
    if (effectiveKind === "auto") {
      try {
        const text =
          source.kind === "markdown" ? source.markdown.slice(0, 6000) : "";
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
                    { type: "file" as const, data: fileBuf, mediaType: mimeType } as any,
                  ],
                },
              ];
        const classified = await generateJsonBestEffort({
          model: source.kind === "markdown" ? textModel : visionModel,
          messages,
          schema: KindClassifySchema,
          fallback: { kind: "unknown" },
          label: "document kind classification",
        });
        const k = classified?.kind;
        if (k && k !== "unknown") {
          effectiveKind = k;
        }
      } catch (e) {
        console.warn("[parse-document] auto classify failed:", (e as Error)?.message);
      }
    }

    // Nếu kind đã được resolve khác với opts.kind, cần re-ensure row với kind đúng
    if (effectiveKind !== opts.kind && opts.supabase && opts.userId) {
      const reUp = await ensureUploadRow({
        supabase: opts.supabase,
        userId: opts.userId,
        fileBuf,
        fileHash,
        filename: opts.filename,
        mimeType,
        kind: effectiveKind,
      });
      if (reUp?.uploadId) uploadId = reUp.uploadId;
    }

    // ---- 5. Structurer
    emitPhase({ name: "extract", status: "start" });
    const structStart = Date.now();
    let parsed: any;

    try {
      if (effectiveKind === "bank_statement") {
        parsed = await structureBankStatement(source, textModel, visionModel, fileBuf, mimeType);
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
                    { type: "file" as const, data: fileBuf, mediaType: mimeType } as any,
                  ],
                },
              ];
        const model = source.kind === "markdown" ? textModel : visionModel;
        if (schema) {
          parsed = await generateJsonBestEffort({
            model,
            messages,
            schema,
            fallback: {},
            label: effectiveKind,
          });
        } else {
          const r = await generateText({ model, messages });
          parsed = extractJSON(r.text) ?? { raw: r.text };
        }
      }
    } catch (err: any) {
      console.warn("[parse-document] structurer failed:", err?.message);
      // Fallback: retry without structured schema using vision model + raw file.
      try {
        const r = await generateText({
          model: visionModel,
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: (PROMPTS[effectiveKind] || "") + PROMPT_TAIL },
                { type: "file", data: fileBuf, mediaType: mimeType } as any,
              ],
            },
          ],
        });
        parsed = extractJSON(r.text) ?? { raw: r.text, _schemaError: err?.message };
      } catch (err2: any) {
        parsed = { raw: null, _schemaError: err?.message, _fallbackError: err2?.message };
      }
    }
    let parserUsed = source.parser;
    if (effectiveKind === "purchase_invoice") {
      const rawText = source.kind === "markdown" ? source.markdown : null;
      parsed = normalizePurchaseInvoice(parsed, rawText, `Đã đọc bằng ${source.parser}.`);

      if (mimeType === "application/pdf" && source.kind === "markdown" && isEmptyPurchaseInvoice(parsed)) {
        try {
          const retry = await generateJsonBestEffort({
            model: visionModel,
            messages: [
              {
                role: "user",
                content: [
                  {
                    type: "text",
                    text:
                      PROMPTS.purchase_invoice +
                      PROMPT_TAIL +
                      "\n\nPDF này có thể là bản scan hoặc text-layer nghèo. Hãy OCR trực tiếp từ file gốc và ưu tiên lấy NCC, MST, số hóa đơn, ngày, tổng tiền, dòng hàng.",
                  },
                  { type: "file", data: fileBuf, mediaType: mimeType } as any,
                ],
              },
            ],
            schema: PurchaseInvoiceSchema,
            fallback: parsed,
            label: "purchase_invoice",
          });
          const normalizedRetry = normalizePurchaseInvoice(
            retry,
            rawText,
            `Kết quả ${source.parser} thiếu dữ liệu chính, đã retry bằng Vision trên PDF gốc.`,
          );
          if (!isEmptyPurchaseInvoice(normalizedRetry)) {
            parsed = normalizedRetry;
            parserUsed = `${source.parser}+vision`;
          }
        } catch (retryErr: any) {
          parsed = {
            ...parsed,
            _parserNotes: `Đã đọc bằng ${source.parser}; retry Vision không thành công: ${retryErr?.message || "unknown"}`,
          };
        }
      }
    }
    if (effectiveKind === "purchase_invoice") {
      parsed = await enrichInvoiceWithSupplierSignals(parsed, opts.supabase, opts.userId);
    }
    const structurerMs = Date.now() - structStart;
    emitPhase({ name: "extract", status: "done", ms: structurerMs });

    // ---- 5b. Post-extract phases (visual progression for downstream checks)
    emitPhase({ name: "partner_match", status: "start" });
    emitPhase({ name: "partner_match", status: "done", ms: 0 });
    emitPhase({ name: "rules_check", status: "start" });
    emitPhase({ name: "rules_check", status: "done", ms: 0 });


    // ---- 6. Write to cache
    if (opts.supabase && effectiveKind !== "auto") {
      await writeParseCache(opts.supabase, fileHash, effectiveKind, parsed, parserUsed, source.pageCount || null);
    }

    // ---- 7. Update ai_uploads với kết quả parse
    if (uploadId && opts.supabase) {
      try {
        await opts.supabase
          .from("ai_uploads")
          .update({
            kind: effectiveKind,
            parsed: typeof parsed === "string" ? { raw: parsed } : parsed,
            parser_used: parserUsed,
            parser_ms: parserMs,
            structurer_ms: structurerMs,
            pages: source.pageCount || null,
            status: "parsed",
            error: source.llamaError
              ? `LlamaParse[${source.llamaError.phase}${source.llamaError.status ? ` ${source.llamaError.status}` : ""}] ${source.llamaError.message}`
              : null,
          })
          .eq("id", uploadId);
        await updateDocumentOcr({
          supabase: opts.supabase,
          uploadId,
          status: "done",
          parsed: typeof parsed === "string" ? { raw: parsed } : parsed,
        });
      } catch {}
    }

    return {
      kind: effectiveKind,
      uploadId,
      parsed,
      parser: parserUsed,
      cached: false,
      pages: source.pageCount || null,
      timings: { parserMs, structurerMs },
      llamaError: source.llamaError ?? null,
      file_hash: fileHash,
    };
  } catch (err: any) {
    await markFailed(err?.message || "Parse failed");
    throw err;
  }
}

export const parseDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => InputSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    const { tryLogAgentActivity } = await import("@/lib/ai-agents.server");
    const t0 = Date.now();
    try {
      const result = await parseFileCore({ ...data, supabase, userId });
      const kindLabel =
        result.kind === "purchase_invoice"
          ? "hoá đơn mua"
          : result.kind === "bank_statement"
            ? "sao kê ngân hàng"
            : result.kind === "cash_voucher"
              ? "phiếu thu/chi"
              : "tài liệu";
      const vendor =
        (result.parsed as any)?.vendor_name ||
        (result.parsed as any)?.account_holder ||
        (result.parsed as any)?.party_name ||
        data.filename ||
        "";
      await tryLogAgentActivity(supabase, userId, {
        agent_id: "extract",
        action: `Trích xuất ${kindLabel}${vendor ? ` — ${vendor}` : ""}`,
        result: (result.parsed as any)?._schemaWarning ? "warning" : "success",
        duration_ms: Date.now() - t0,
        metadata: { parser: result.parser, kind: result.kind, pages: result.pages },
      });
      return result;
    } catch (err: any) {
      await tryLogAgentActivity(supabase, userId, {
        agent_id: "extract",
        action: `Trích xuất thất bại — ${data.filename ?? "tài liệu"}`,
        result: "error",
        duration_ms: Date.now() - t0,
        metadata: { error: err?.message?.slice(0, 200) },
      });
      throw err;
    }
  });

export const uploadChatAttachment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => UploadOnlyInputSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    const fileBuf = Buffer.from(data.fileBase64, "base64");
    const fileHash = await hashBase64(data.fileBase64);
    const mimeType = normalizeFileMime(data.mimeType, data.filename);
    const uploadInfo = await ensureUploadRow({
      supabase,
      userId,
      fileBuf,
      fileHash,
      filename: data.filename,
      mimeType,
      kind: data.kind,
    });
    if (!uploadInfo?.uploadId) throw new Error("Không lưu được file đính kèm");
    return { uploadId: uploadInfo.uploadId, filePath: uploadInfo.filePath, file_hash: fileHash };
  });

// ---- Signed URL để xem file gốc trong UI ----
const SignedUrlInput = z.object({ uploadId: z.string().uuid() });

export const getUploadSignedUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => SignedUrlInput.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    const { data: row, error } = await supabase
      .from("ai_uploads")
      .select("file_path, filename, user_id, mime_type")
      .eq("id", data.uploadId)
      .maybeSingle();
    if (error || !row) throw new Error("Không tìm thấy file");
    if (row.user_id !== userId) throw new Error("Không có quyền");
    if (!row.file_path) {
      return { url: null, filename: row.filename, mimeType: row.mime_type ?? null, documentId: null };
    }
    const { data: signed, error: sErr } = await supabase.storage
      .from("invoices")
      .createSignedUrl(row.file_path, 3600);
    if (sErr || !signed?.signedUrl) {
      return { url: null, filename: row.filename, mimeType: row.mime_type ?? null, documentId: null };
    }
    const { data: doc } = await supabase
      .from("documents")
      .select("id")
      .eq("ai_upload_id", data.uploadId)
      .maybeSingle();
    return {
      url: signed.signedUrl,
      filename: row.filename,
      mimeType: row.mime_type ?? null,
      documentId: doc?.id ?? null,
    };
  });
