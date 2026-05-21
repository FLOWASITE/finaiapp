/**
 * Server-only: phân loại nhanh 1 file (PDF/ảnh/Excel) → loại chứng từ
 * (hoá đơn vào / hoá đơn ra / sao kê / phiếu thu chi / không liên quan).
 *
 * Dùng cho luồng bulk upload, trước khi đẩy vào parse chi tiết.
 * Cache theo `ai_uploads.classify_meta` (key = file_hash + tenant) để
 * upload lại không tốn token.
 */
import { generateText, Output } from "ai";
import { z } from "zod";
import { resolveActiveModel } from "@/lib/ai-gateway.server";
import { extractPdfText } from "@/lib/ai/pdf-text.server";

export type ClassifyKind =
  | "purchase_invoice"
  | "sales_invoice"
  | "bank_statement"
  | "cash_voucher"
  | "other";

export type ClassifyResult = {
  kind: ClassifyKind;
  confidence: number;
  reason: string;
  seller_tax_id?: string | null;
  buyer_tax_id?: string | null;
  /** 'ai' | 'cache' | 'heuristic-fallback' */
  source: "ai" | "cache" | "heuristic-fallback";
};

const Schema = z.object({
  kind: z.enum([
    "purchase_invoice",
    "sales_invoice",
    "bank_statement",
    "cash_voucher",
    "other",
  ]),
  confidence: z.number().min(0).max(1),
  reason: z.string().max(200),
  seller_tax_id: z.string().nullable().optional(),
  buyer_tax_id: z.string().nullable().optional(),
});

function normTaxId(s: string | null | undefined): string {
  if (!s) return "";
  return String(s).replace(/[^0-9]/g, "");
}

/** Đọc tenant tax_id để xác định vào/ra. */
async function getTenantTaxId(supabase: any, userId: string): Promise<string> {
  try {
    const { data: prof } = await supabase
      .from("profiles")
      .select("active_tenant_id")
      .eq("id", userId)
      .maybeSingle();
    const tid = prof?.active_tenant_id;
    if (!tid) return "";
    const { data: t } = await supabase
      .from("tenants")
      .select("tax_id")
      .eq("id", tid)
      .maybeSingle();
    return normTaxId(t?.tax_id);
  } catch {
    return "";
  }
}

export async function classifyFile(opts: {
  supabase: any;
  userId: string;
  filename: string;
  mime: string;
  base64: string;
  fileHash: string | null;
}): Promise<ClassifyResult> {
  // 1. Cache hit?
  if (opts.fileHash) {
    try {
      const { data: row } = await opts.supabase
        .from("ai_uploads")
        .select("classify_meta")
        .eq("user_id", opts.userId)
        .eq("file_hash", opts.fileHash)
        .not("classify_meta", "is", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const cached = row?.classify_meta as ClassifyResult | undefined;
      if (cached && cached.kind) {
        return { ...cached, source: "cache" };
      }
    } catch {
      // ignore cache errors
    }
  }

  const tenantTaxId = await getTenantTaxId(opts.supabase, opts.userId);
  const isPdf = opts.mime === "application/pdf";
  const isImg = opts.mime.startsWith("image/");

  // 2. Build prompt
  let textSnippet = "";
  if (isPdf) {
    try {
      const r = await extractPdfText(opts.base64);
      textSnippet = (r.text || "").slice(0, 4000);
    } catch (e) {
      console.warn("[classify-file] pdf extract failed:", (e as Error).message);
    }
  }

  const systemPrompt = `Bạn là trợ lý kế toán Việt Nam. Phân loại file đính kèm vào MỘT trong các loại:
- purchase_invoice: hoá đơn GTGT mà người mua là doanh nghiệp này (đầu vào).
- sales_invoice: hoá đơn GTGT mà người bán là doanh nghiệp này (đầu ra).
- bank_statement: sao kê tài khoản ngân hàng (có cột nợ/có, số dư).
- cash_voucher: phiếu thu / phiếu chi tiền mặt.
- other: không liên quan kế toán (hợp đồng, biên bản, ảnh chụp tự do, CV...).

${tenantTaxId ? `MST của doanh nghiệp đang dùng app: ${tenantTaxId}. Nếu nhận diện được MST bên mua/bán, dùng để quyết định đầu vào hay đầu ra.` : ""}

Trả về confidence 0..1 (>=0.85 = rất chắc), reason ngắn gọn tiếng Việt (<=120 ký tự).`;

  const userParts: any[] = [
    { type: "text", text: `Tên file: ${opts.filename}\nMime: ${opts.mime}` },
  ];
  if (textSnippet) {
    userParts.push({ type: "text", text: `Trích văn bản (đầu file):\n${textSnippet}` });
  } else if (isImg) {
    userParts.push({
      type: "image",
      image: `data:${opts.mime};base64,${opts.base64}`,
    });
  } else if (isPdf) {
    // PDF không trích được text → gửi file để model nhìn
    userParts.push({
      type: "file",
      data: `data:${opts.mime};base64,${opts.base64}`,
      mediaType: opts.mime,
    });
  }

  // 3. Gọi AI
  try {
    const { model } = await resolveActiveModel("classify", "google/gemini-3-flash-preview");
    const { output } = await generateText({
      model,
      output: Output.object({ schema: Schema }),
      system: systemPrompt,
      messages: [{ role: "user", content: userParts }],
    });

    let kind = output.kind as ClassifyKind;
    // Override bằng MST nếu rõ
    if (tenantTaxId && (kind === "purchase_invoice" || kind === "sales_invoice")) {
      const seller = normTaxId(output.seller_tax_id);
      const buyer = normTaxId(output.buyer_tax_id);
      if (buyer && buyer === tenantTaxId) kind = "purchase_invoice";
      else if (seller && seller === tenantTaxId) kind = "sales_invoice";
    }

    const result: ClassifyResult = {
      kind,
      confidence: output.confidence,
      reason: output.reason,
      seller_tax_id: output.seller_tax_id ?? null,
      buyer_tax_id: output.buyer_tax_id ?? null,
      source: "ai",
    };

    // 4. Cache về DB (best-effort)
    if (opts.fileHash) {
      try {
        await opts.supabase
          .from("ai_uploads")
          .update({ classify_meta: result })
          .eq("user_id", opts.userId)
          .eq("file_hash", opts.fileHash);
      } catch {
        /* ignore */
      }
    }
    return result;
  } catch (e: any) {
    console.warn("[classify-file] AI failed:", e?.message);
    return {
      kind: "other",
      confidence: 0,
      reason: "Phân loại AI thất bại, dùng tên file",
      source: "heuristic-fallback",
    };
  }
}
