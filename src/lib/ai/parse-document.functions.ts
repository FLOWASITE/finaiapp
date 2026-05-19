import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { generateText, Output } from "ai";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveActiveModel } from "@/lib/ai-gateway.server";

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

const PROMPTS: Record<string, string> = {
  purchase_invoice:
    "Trích xuất dữ liệu **hoá đơn mua** (hoá đơn GTGT/đầu vào) từ file đính kèm. Trả về JSON theo schema. Nếu không thấy thông tin, để null.",
  bank_statement:
    "Trích xuất dữ liệu **sao kê ngân hàng** từ file. Trả JSON dạng { transactions: [{date, description, debit, credit, balance}] }. Số tiền là VND, không dấu phẩy.",
  cash_voucher:
    "Trích xuất **phiếu thu/chi tiền mặt** từ ảnh/PDF. Trả JSON { voucher_type, voucher_no, date, party_name, amount, reason }.",
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

export const parseDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => InputSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    const { model } = await resolveActiveModel("parse", "google/gemini-2.5-pro");


    // For purchase_invoice we use a strict schema; other kinds free-form JSON.
    const useStrict = data.kind === "purchase_invoice";

    const fileBuf = Buffer.from(data.fileBase64, "base64");

    const messages = [
      {
        role: "user" as const,
        content: [
          {
            type: "text" as const,
            text:
              (PROMPTS[data.kind] || PROMPTS.auto) +
              "\n\nCHỈ trả về JSON hợp lệ, không giải thích, không markdown fences. Số tiền là số (không dấu phẩy/chấm phân cách hàng nghìn). Thiếu thông tin thì dùng null.",
          },
          {
            type: "file" as const,
            data: fileBuf,
            mediaType: data.mimeType,
          } as any,
        ],
      },
    ];

    let parsed: any;
    try {
      if (useStrict) {
        const r = await generateText({
          model,
          output: Output.object({ schema: PurchaseInvoiceSchema }),
          messages,
        });
        parsed = (r as any).output;
      } else {
        const r = await generateText({ model, messages });
        parsed = extractJSON(r.text) ?? { raw: r.text };
      }
    } catch (err: any) {
      // Strict schema mismatch → fall back to free-form text + best-effort JSON extraction.
      const r = await generateText({ model, messages });
      parsed = extractJSON(r.text) ?? { raw: r.text, _schemaError: err?.message };
    }

    // Persist upload metadata (best-effort).
    let uploadId: string | null = null;
    try {
      const path = `ai-uploads/${userId}/${Date.now()}-${data.filename || "file"}`;
      await supabase.storage.from("invoices").upload(path, fileBuf, {
        contentType: data.mimeType,
        upsert: false,
      });
      const { data: row } = await supabase
        .from("ai_uploads")
        .insert({
          user_id: userId,
          file_path: path,
          mime_type: data.mimeType,
          filename: data.filename || null,
          kind: data.kind,
          parsed: typeof parsed === "string" ? { raw: parsed } : parsed,
        })
        .select("id")
        .maybeSingle();
      uploadId = row?.id ?? null;
    } catch {
      // ai_uploads table may not exist yet — ignore silently
    }

    return {
      kind: data.kind,
      uploadId,
      parsed,
    };
  });
