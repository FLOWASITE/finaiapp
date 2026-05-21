/**
 * Server-only: phân loại nhanh 1 file (PDF/ảnh/Excel) → loại chứng từ
 * (hoá đơn vào / hoá đơn ra / sao kê / phiếu thu chi / không liên quan).
 *
 * Dùng cho luồng bulk upload, trước khi đẩy vào parse chi tiết.
 * Cache theo `ai_uploads.classify_meta` (key = file_hash + tenant) để
 * upload lại không tốn token.
 */
import { createHash } from "crypto";
import { generateText, Output } from "ai";
import { z } from "zod";
import { resolveActiveModel } from "@/lib/ai-gateway.server";
import { extractPdfText } from "@/lib/ai/pdf-text.server";
import { parseEinvoiceXml } from "@/lib/einvoice-xml-parser";

/** sha256 hex of the first 2KB of normalized text — fingerprint for cross-file cache. */
function textFingerprint(text: string): string {
  const norm = text.replace(/\s+/g, " ").trim().slice(0, 2000);
  return createHash("sha256").update(norm, "utf8").digest("hex");
}

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
  /** Nguồn phân loại — để biết có tốn token AI hay không */
  source: "ai" | "cache" | "xml" | "text-rule" | "heuristic-fallback";
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

function isXmlInvoiceCandidate(mime: string, filename: string): boolean {
  const m = (mime || "").toLowerCase();
  const f = (filename || "").toLowerCase();
  return m.includes("xml") || f.endsWith(".xml");
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
/**
 * Phân loại không-LLM dựa trên text trích từ PDF.
 * Trả về null nếu không đủ căn cứ → để LLM xử lý.
 */
function classifyByTextRule(
  text: string,
  tenantTaxId: string,
): ClassifyResult | null {
  const t = text.toLowerCase();

  // 1) Loại trừ rõ ràng: hợp đồng / báo giá / CV
  const isContract =
    /\b(hợp đồng|hop dong|biên bản|bien ban|báo giá|bao gia|quotation|curriculum vitae|résumé|resume)\b/i.test(t) &&
    !/hoá đơn|hoa don|invoice|gtgt|vat/i.test(t);
  if (isContract) {
    return {
      kind: "other",
      confidence: 0.9,
      reason: "Văn bản chứa 'hợp đồng/báo giá/CV', không có dấu hiệu hoá đơn",
      source: "text-rule",
    };
  }

  // 2) Sao kê ngân hàng
  const isStatement =
    /(sao kê|sao ke|account statement|bank statement)/i.test(t) ||
    (/(số dư đầu kỳ|so du dau ky|opening balance)/i.test(t) &&
      /(số dư cuối kỳ|so du cuoi ky|closing balance)/i.test(t)) ||
    (/(nợ|debit)/i.test(t) && /(có|credit)/i.test(t) && /(số dư|balance)/i.test(t));
  if (isStatement) {
    return {
      kind: "bank_statement",
      confidence: 0.92,
      reason: "Text có dấu hiệu sao kê (số dư đầu/cuối, cột nợ/có)",
      source: "text-rule",
    };
  }

  // 3) Phiếu thu / phiếu chi
  const isCashVoucher =
    /\b(phiếu thu|phieu thu|phiếu chi|phieu chi)\b/i.test(t) &&
    /(người nộp tiền|nguoi nop tien|người nhận tiền|nguoi nhan tien|lý do|ly do)/i.test(t);
  if (isCashVoucher) {
    return {
      kind: "cash_voucher",
      confidence: 0.9,
      reason: "Text có 'Phiếu thu/chi' + người nộp/nhận tiền",
      source: "text-rule",
    };
  }

  // 4) Hoá đơn GTGT — cần KEYWORD hoá đơn + MST 10-13 số
  const hasInvoiceKeyword =
    /(hoá đơn giá trị gia tăng|hoa don gia tri gia tang|hoá đơn gtgt|hoa don gtgt|\bvat invoice\b|tax invoice)/i.test(
      t,
    );
  if (hasInvoiceKeyword) {
    // Trích tất cả MST
    const mstMatches = Array.from(text.matchAll(/\b(\d{10}(?:[-\s]?\d{3})?)\b/g)).map(
      (m) => m[1].replace(/[-\s]/g, ""),
    );
    const uniqMst = Array.from(new Set(mstMatches)).filter(
      (s) => s.length === 10 || s.length === 13,
    );

    // Heuristic: MST gần "bên bán" / "bên mua"
    let seller = "";
    let buyer = "";
    const sellerCtx = t.match(/(?:bên bán|ben ban|đơn vị bán|don vi ban|seller)[\s\S]{0,200}/i);
    const buyerCtx = t.match(/(?:bên mua|ben mua|đơn vị mua|don vi mua|buyer)[\s\S]{0,200}/i);
    if (sellerCtx) {
      const m = sellerCtx[0].match(/\b(\d{10}(?:[-\s]?\d{3})?)\b/);
      if (m) seller = m[1].replace(/[-\s]/g, "");
    }
    if (buyerCtx) {
      const m = buyerCtx[0].match(/\b(\d{10}(?:[-\s]?\d{3})?)\b/);
      if (m) buyer = m[1].replace(/[-\s]/g, "");
    }

    // Nếu chỉ có 2 MST, suy ra theo thứ tự xuất hiện
    if (!seller && !buyer && uniqMst.length >= 2) {
      seller = uniqMst[0];
      buyer = uniqMst[1];
    }

    let kind: ClassifyKind = "purchase_invoice";
    let confidence = 0.85;
    let reason = "Text có 'Hoá đơn GTGT' + MST";

    if (tenantTaxId) {
      if (seller === tenantTaxId) {
        kind = "sales_invoice";
        confidence = 0.95;
        reason = "Hoá đơn GTGT, MST tenant khớp bên bán → HĐ ra";
      } else if (buyer === tenantTaxId) {
        kind = "purchase_invoice";
        confidence = 0.95;
        reason = "Hoá đơn GTGT, MST tenant khớp bên mua → HĐ vào";
      } else if (uniqMst.length > 0) {
        confidence = 0.6;
        reason = "Hoá đơn GTGT nhưng MST tenant chưa khớp bên mua/bán — cần AI xác nhận";
        return null; // để LLM phân định
      }
    } else if (uniqMst.length === 0) {
      return null; // không có MST, để LLM
    }

    return {
      kind,
      confidence,
      reason,
      seller_tax_id: seller || null,
      buyer_tax_id: buyer || null,
      source: "text-rule",
    };
  }

  return null;
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

  if (isXmlInvoiceCandidate(opts.mime, opts.filename)) {
    try {
      const xmlText = Buffer.from(opts.base64, "base64").toString("utf8");
      const parsed = parseEinvoiceXml(xmlText);
      const seller = normTaxId(parsed.seller.tax_id);
      const buyer = normTaxId(parsed.buyer.tax_id);
      let kind: ClassifyKind = "purchase_invoice";
      let confidence = 0.9;
      let reason = `XML HĐĐT ${parsed.invoice_no || ""} — thấy MST bán ${seller || "?"}, mua ${buyer || "?"}`.trim();

      if (tenantTaxId) {
        if (seller === tenantTaxId) {
          kind = "sales_invoice";
          confidence = 0.98;
          reason = `XML HĐĐT, MST tenant khớp bên bán → HĐ đầu ra`;
        } else if (buyer === tenantTaxId) {
          kind = "purchase_invoice";
          confidence = 0.98;
          reason = `XML HĐĐT, MST tenant khớp bên mua → HĐ đầu vào`;
        } else {
          confidence = 0.55;
          reason = `XML HĐĐT nhưng MST tenant không khớp bên bán/mua`;
        }
      }

      const result: ClassifyResult = {
        kind,
        confidence,
        reason,
        seller_tax_id: seller || null,
        buyer_tax_id: buyer || null,
        source: "xml",
      };
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
      console.warn("[classify-file] xml parse failed:", e?.message);
    }
  }

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

  // 2.4. Cache theo text fingerprint (D) — bắt file khác hash nhưng cùng nội dung text.
  let textHash: string | null = null;
  if (textSnippet && textSnippet.length >= 200) {
    textHash = textFingerprint(textSnippet);
    try {
      const { data: row } = await opts.supabase
        .from("ai_uploads")
        .select("classify_meta")
        .eq("user_id", opts.userId)
        .filter("classify_meta->>text_hash", "eq", textHash)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const cached = row?.classify_meta as (ClassifyResult & { text_hash?: string }) | undefined;
      if (cached && cached.kind) {
        const hit: ClassifyResult = {
          kind: cached.kind,
          confidence: cached.confidence,
          reason: cached.reason,
          seller_tax_id: cached.seller_tax_id ?? null,
          buyer_tax_id: cached.buyer_tax_id ?? null,
          source: "cache",
        };
        // best-effort: ghi cache cho file_hash hiện tại để lần sau hit nhanh hơn
        if (opts.fileHash) {
          try {
            await opts.supabase
              .from("ai_uploads")
              .update({ classify_meta: { ...hit, text_hash: textHash } })
              .eq("user_id", opts.userId)
              .eq("file_hash", opts.fileHash);
          } catch { /* ignore */ }
        }
        return hit;
      }
    } catch { /* ignore */ }
  }

  // 2.5. Text-rule classifier — bắt nhanh PDF có text rõ ràng, KHÔNG gọi LLM.
  if (textSnippet && textSnippet.length >= 200) {
    const ruleResult = classifyByTextRule(textSnippet, tenantTaxId);
    if (ruleResult) {
      if (opts.fileHash) {
        try {
          await opts.supabase
            .from("ai_uploads")
            .update({ classify_meta: { ...ruleResult, text_hash: textHash } })
            .eq("user_id", opts.userId)
            .eq("file_hash", opts.fileHash);
        } catch {
          /* ignore */
        }
      }
      return ruleResult;
    }
  }


  const systemPrompt = `Bạn là trợ lý kế toán Việt Nam. Phân loại file đính kèm vào MỘT trong các loại:
- purchase_invoice: hoá đơn GTGT mà người mua là doanh nghiệp đang dùng app (đầu vào).
- sales_invoice: hoá đơn GTGT mà người bán là doanh nghiệp đang dùng app (đầu ra).
- bank_statement: sao kê tài khoản ngân hàng (có cột nợ/có, số dư đầu/cuối kỳ, danh sách giao dịch).
- cash_voucher: phiếu thu / phiếu chi tiền mặt (có "Phiếu thu", "Phiếu chi", "Người nộp tiền"...).
- other: KHÔNG phải chứng từ kế toán — hợp đồng, báo giá, biên bản, CV, ảnh tự do, tài liệu marketing, email...

QUY TẮC CONFIDENCE (BẮT BUỘC):
- confidence >= 0.85 chỉ khi nhìn THẤY RÕ ÍT NHẤT 2 trong: "Hoá đơn GTGT" / "Mã số thuế" + MST 10-13 số / "Số hoá đơn" / "Ngày" / bảng nợ-có với số dư.
- confidence 0.5-0.84 khi đoán dựa vào layout nhưng thiếu chi tiết.
- confidence < 0.5 khi không chắc — KHÔNG được đoán bừa là purchase_invoice.
- Hợp đồng / báo giá / CV / ảnh chụp không phải chứng từ → BẮT BUỘC "other" (không phải "purchase_invoice").
- Trích MST bên bán (seller_tax_id) và bên mua (buyer_tax_id) nếu nhìn thấy — chỉ giữ chữ số, 10-13 ký tự.

${tenantTaxId ? `MST doanh nghiệp đang dùng app: ${tenantTaxId}. Hãy CỐ GẮNG trích buyer/seller tax id để hệ thống có thể chốt đầu vào/đầu ra.` : ""}

reason ngắn gọn tiếng Việt (<=140 ký tự), nêu căn cứ cụ thể (vd: "thấy 'Hoá đơn GTGT' + MST bên bán 0312345678").`;

  const userParts: any[] = [
    { type: "text", text: `Tên file: ${opts.filename}\nMime: ${opts.mime}` },
  ];
  // (B) Với PDF scan lớn (>5MB) không có text layer → chỉ gửi filename, bỏ qua bytes
  // để giảm token vision. AI sẽ chỉ đoán theo tên — confidence thường < 0.5 → bucket "ask".
  const sizeBytes = Math.floor((opts.base64.length * 3) / 4);
  const skipPdfBytes = isPdf && !textSnippet && sizeBytes > 5 * 1024 * 1024;

  if (textSnippet) {
    userParts.push({ type: "text", text: `Trích văn bản (đầu file):\n${textSnippet}` });
  } else if (isImg) {
    userParts.push({
      type: "image",
      image: `data:${opts.mime};base64,${opts.base64}`,
    });
  } else if (isPdf && !skipPdfBytes) {
    userParts.push({
      type: "file",
      data: `data:${opts.mime};base64,${opts.base64}`,
      mediaType: opts.mime,
    });
  } else if (skipPdfBytes) {
    userParts.push({
      type: "text",
      text: `(PDF scan kích thước ${(sizeBytes / 1024 / 1024).toFixed(1)}MB không có lớp text — chỉ phân loại dựa theo tên file. Nếu không đủ chắc, hãy trả "other" với confidence thấp.)`,
    });
  }

  // 3. Gọi AI — dùng model lite (rẻ hơn) làm mặc định, fallback flash-preview nếu lỗi.
  try {
    let model;
    try {
      ({ model } = await resolveActiveModel("classify", "google/gemini-3.1-flash-lite-preview"));
    } catch (liteErr) {
      console.warn("[classify-file] lite model failed, fallback flash:", (liteErr as Error).message);
      ({ model } = await resolveActiveModel("classify", "google/gemini-3-flash-preview"));
    }
    const { output } = await generateText({
      model,
      output: Output.object({ schema: Schema }),
      system: systemPrompt,
      messages: [{ role: "user", content: userParts }],
    });

    let kind = output.kind as ClassifyKind;
    let confidence = output.confidence;
    let reason = output.reason;
    const seller = normTaxId(output.seller_tax_id);
    const buyer = normTaxId(output.buyer_tax_id);

    // MST chốt chặn (chỉ khi tenant đã khai MST)
    if (tenantTaxId) {
      const sellerMatch = seller && seller === tenantTaxId;
      const buyerMatch = buyer && buyer === tenantTaxId;

      // Override "other" → invoice nếu MST khớp tenant (model đôi khi không tự tin)
      if (kind === "other" && (sellerMatch || buyerMatch)) {
        kind = buyerMatch ? "purchase_invoice" : "sales_invoice";
        confidence = Math.max(confidence, 0.8);
        reason = `MST tenant khớp ${buyerMatch ? "bên mua" : "bên bán"} → ép thành ${kind === "purchase_invoice" ? "HĐ vào" : "HĐ ra"} (${reason})`;
      }
      // Flip purchase ↔ sales nếu MST nói ngược lại
      else if (kind === "purchase_invoice" && sellerMatch && !buyerMatch) {
        kind = "sales_invoice";
        reason = `MST tenant khớp bên bán → đổi sang HĐ ra (${reason})`;
      } else if (kind === "sales_invoice" && buyerMatch && !sellerMatch) {
        kind = "purchase_invoice";
        reason = `MST tenant khớp bên mua → đổi sang HĐ vào (${reason})`;
      }
      // Hạ confidence nếu cho là hoá đơn mà MST tenant không khớp cả bên mua lẫn bên bán
      else if (
        (kind === "purchase_invoice" || kind === "sales_invoice") &&
        (seller || buyer) &&
        !sellerMatch &&
        !buyerMatch
      ) {
        confidence = Math.min(confidence, 0.45);
        reason = `MST tenant không khớp bên mua/bán nào → hạ tin cậy (${reason})`;
      }
    }

    const result: ClassifyResult = {
      kind,
      confidence,
      reason,
      seller_tax_id: output.seller_tax_id ?? null,
      buyer_tax_id: output.buyer_tax_id ?? null,
      source: "ai",
    };

    // 4. Cache về DB (best-effort) — kèm text_hash để hit cross-file-hash sau này.
    if (opts.fileHash) {
      try {
        await opts.supabase
          .from("ai_uploads")
          .update({ classify_meta: { ...result, text_hash: textHash } })
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
      reason: "Phân loại AI thất bại, cần sếp xác nhận",
      source: "heuristic-fallback",
    };
  }
}
