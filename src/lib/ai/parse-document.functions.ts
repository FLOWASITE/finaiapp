import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { generateText, Output } from "ai";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveActiveModel } from "@/lib/ai-gateway.server";
import { isLlamaParseEnabled, parseToMarkdown } from "@/lib/ai/llamaparse.server";

const InputSchema = z.object({
  /** Base64-encoded file contents (without the data: prefix). */
  fileBase64: z.string().min(1),
  mimeType: z.string().min(3).max(100),
  filename: z.string().max(255).optional(),
  kind: z.enum(["purchase_invoice", "bank_statement", "cash_voucher", "auto"]).default("auto"),
});

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

const BankStatementSchema = z.object({
  account_no: z.string().nullable(),
  account_holder: z.string().nullable(),
  bank_name: z.string().nullable(),
  currency: z.string().nullable().describe("ISO code, e.g. VND"),
  period_from: z.string().nullable().describe("YYYY-MM-DD"),
  period_to: z.string().nullable().describe("YYYY-MM-DD"),
  opening_balance: z.number().nullable(),
  closing_balance: z.number().nullable(),
  transactions: z
    .array(
      z.object({
        date: z.string().describe("YYYY-MM-DD"),
        value_date: z.string().nullable().describe("YYYY-MM-DD"),
        description: z.string(),
        debit: z.number().nullable().describe("Số tiền ghi NỢ (chi ra), dương"),
        credit: z.number().nullable().describe("Số tiền ghi CÓ (thu vào), dương"),
        balance: z.number().nullable(),
        ref_no: z.string().nullable(),
        counterparty: z.string().nullable(),
      }),
    )
    .default([]),
});

const PROMPTS: Record<string, string> = {
  purchase_invoice:
    "Trích xuất dữ liệu **hoá đơn mua** (hoá đơn GTGT/đầu vào) từ tài liệu. Trả về JSON theo schema. Nếu không thấy thông tin, để null.",
  bank_statement:
    "Trích xuất **toàn bộ giao dịch** trong **sao kê ngân hàng** từ tài liệu. Trả JSON theo schema. Số tiền là VND, không dấu phẩy/chấm phân cách hàng nghìn, không dấu âm — phân biệt Nợ/Có vào hai cột debit/credit.",
  cash_voucher:
    "Trích xuất **phiếu thu/chi tiền mặt** từ tài liệu. Trả JSON { voucher_type, voucher_no, date, party_name, amount, reason }.",
  auto:
    "Nhận diện loại chứng từ (hoá đơn mua, sao kê, phiếu thu/chi) rồi trả JSON phù hợp. Tự đặt khóa 'kind' = 'purchase_invoice' | 'bank_statement' | 'cash_voucher' và lồng dữ liệu vào khóa 'data'.",
};

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
  try { return JSON.parse(s); } catch { return null; }
}

/** Should we send the file through LlamaParse first? */
function shouldPreparse(mimeType: string): boolean {
  if (!isLlamaParseEnabled()) return false;
  return (
    mimeType === "application/pdf" ||
    mimeType.startsWith("image/") ||
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
}

/**
 * Core parsing logic (no createServerFn wrapper) — callable from other server
 * functions (e.g. the chat stream) so we can run parseDocument inline as a
 * tool-call without an extra HTTP roundtrip.
 *
 * Pipeline (new):
 *   file ──► LlamaParse (markdown)  ──► Gemini Flash structured output ──► JSON
 *           (skip if no key/non-PDF)    (or schema-less for `auto`/cash_voucher)
 * Fallback: nếu LlamaParse lỗi → giữ pipeline vision cũ trên Gemini 2.5 Pro.
 */
export async function parseFileCore(opts: {
  fileBase64: string;
  mimeType: string;
  filename?: string;
  kind: "purchase_invoice" | "bank_statement" | "cash_voucher" | "auto";
  supabase?: any;
  userId?: string;
}) {
  const fileBuf = Buffer.from(opts.fileBase64, "base64");

  // ---- 1. Try layout-aware pre-parse ---------------------------------
  let markdown: string | null = null;
  let parserUsed: "llamaparse" | "vision" = "vision";
  if (shouldPreparse(opts.mimeType)) {
    try {
      markdown = await parseToMarkdown({
        fileBase64: opts.fileBase64,
        mimeType: opts.mimeType,
        filename: opts.filename,
        // sao kê dài + bảng → balanced; hoá đơn ngắn cũng OK ở balanced
        tier: "balanced",
      });
      if (markdown && markdown.trim().length > 20) {
        parserUsed = "llamaparse";
      } else {
        markdown = null;
      }
    } catch (e) {
      console.warn("[parse-document] LlamaParse failed, falling back to vision:", (e as Error)?.message);
      markdown = null;
    }
  }

  // ---- 2. Structurer (Gemini) ----------------------------------------
  const { model: visionModel } = await resolveActiveModel("parse", "google/gemini-2.5-pro");
  const { model: textModel } = await resolveActiveModel("parse", "google/gemini-3-flash-preview");

  const promptHead = PROMPTS[opts.kind] || PROMPTS.auto;
  const tail =
    "\n\nCHỈ trả về JSON hợp lệ, không giải thích, không markdown fences. Số tiền là số (không dấu phẩy/chấm phân cách hàng nghìn). Thiếu thông tin thì dùng null.";

  const buildMessages = (useMarkdown: boolean) => {
    if (useMarkdown && markdown) {
      return [
        {
          role: "user" as const,
          content: [
            {
              type: "text" as const,
              text:
                promptHead +
                tail +
                "\n\nDưới đây là nội dung tài liệu đã trích xuất sẵn (markdown, layout-aware). Hãy chỉ căn cứ vào nội dung này:\n\n```markdown\n" +
                markdown +
                "\n```",
            },
          ],
        },
      ];
    }
    // vision fallback
    return [
      {
        role: "user" as const,
        content: [
          { type: "text" as const, text: promptHead + tail },
          { type: "file" as const, data: fileBuf, mediaType: opts.mimeType } as any,
        ],
      },
    ];
  };

  const schemaFor = (kind: string) =>
    kind === "purchase_invoice"
      ? PurchaseInvoiceSchema
      : kind === "bank_statement"
        ? BankStatementSchema
        : null;

  let parsed: any;
  const schema = schemaFor(opts.kind);
  const useMarkdownPass = !!markdown;
  const structuringModel = useMarkdownPass ? textModel : visionModel;
  const messages = buildMessages(useMarkdownPass);

  try {
    if (schema) {
      const r = await generateText({
        model: structuringModel,
        output: Output.object({ schema: schema as any }),
        messages,
      });
      parsed = (r as any).output;
    } else {
      const r = await generateText({ model: structuringModel, messages });
      parsed = extractJSON(r.text) ?? { raw: r.text };
    }
  } catch (err: any) {
    // Schema-strict failure → free-form retry on same input
    try {
      const r = await generateText({ model: structuringModel, messages });
      parsed = extractJSON(r.text) ?? { raw: r.text, _schemaError: err?.message };
    } catch (err2: any) {
      // Last-ditch: if we were on markdown, retry full vision
      if (useMarkdownPass) {
        const visMessages = buildMessages(false);
        const r = await generateText({ model: visionModel, messages: visMessages });
        parsed = extractJSON(r.text) ?? { raw: r.text, _schemaError: err2?.message };
        parserUsed = "vision";
      } else {
        throw err2;
      }
    }
  }

  // ---- 3. Persist upload (best-effort) -------------------------------
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
          kind: opts.kind,
          parsed: typeof parsed === "string" ? { raw: parsed } : parsed,
        })
        .select("id")
        .maybeSingle();
      uploadId = row?.id ?? null;
    } catch {
      // best-effort
    }
  }

  return { kind: opts.kind, uploadId, parsed, parser: parserUsed };
}

export const parseDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => InputSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    return parseFileCore({ ...data, supabase, userId });
  });
