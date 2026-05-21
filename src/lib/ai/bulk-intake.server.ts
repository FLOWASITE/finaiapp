/**
 * Server-only: build a BulkPlan from an array of incoming attachments.
 *
 * Responsibilities:
 *   1. Hash each file
 *   2. Detect duplicates by querying ai_uploads.file_hash for this user
 *   3. Quick classify by (mime, filename) heuristic
 *   4. Upload non-dup files to Storage + create ai_uploads rows so the
 *      bulk-run phase can re-fetch them later without re-sending base64
 *   5. Assign a bucket (auto / review / ask) per item
 */
import { hashBase64 } from "@/lib/ai/parse-cache.server";
import { classifyFile, type ClassifyKind } from "@/lib/ai/classify-file.server";
import { parseEinvoiceXml } from "@/lib/einvoice-xml-parser";
import type {
  BulkItem,
  BulkItemKindGroup,
  BulkPlan,
  BulkBucket,
} from "@/components/chat/bulk/types";

function kindToGroup(kind: ClassifyKind): BulkItemKindGroup {
  if (kind === "purchase_invoice") return "purchase_invoice";
  if (kind === "sales_invoice") return "sales_invoice";
  if (kind === "bank_statement") return "bank_statement";
  if (kind === "cash_voucher") return "other"; // chưa có group riêng
  return "other";
}

function kindToItemKind(kind: ClassifyKind): BulkItem["kind"] {
  if (kind === "purchase_invoice") return "purchase_invoice";
  if (kind === "bank_statement") return "bank_statement";
  if (kind === "cash_voucher") return "cash_voucher";
  // sales_invoice & other → giữ "auto", sẽ ép bucket review/ask
  return "auto";
}

function decideBucket(kind: ClassifyKind, confidence: number): BulkBucket {
  if (kind === "other") return "ask";
  if (kind === "sales_invoice") return "review";
  if (kind === "bank_statement") return "review";
  if (kind === "cash_voucher") return "review";
  if (confidence >= 0.85) return "auto";
  if (confidence >= 0.5) return "review";
  return "ask";
}

type Att = {
  name: string;
  mime: string;
  base64: string;
  kind: "purchase_invoice" | "bank_statement" | "cash_voucher" | "auto";
};

const RX_INVOICE_IN = /(^|[_\-\s])(hd|hđ|hoa[._-]?don|hóa[._-]?đơn|invoice|inv)[_\-\s]?/i;
const RX_INVOICE_OUT = /(^|[_\-\s])(ban|bán|sale|xuất|xuat|xhd|out)[_\-\s]?/i;
const RX_STATEMENT = /(saoke|sao[._-]?kê|sao[._-]?ke|statement|vcb|tcb|bidv|tpbank|mbbank|acb|vietin|agribank|techcom)/i;
const RX_PAYROLL = /(tt|chuyen[._-]?tien|payroll|luong|lương|salary)/i;

function isXmlFile(mime: string, filename: string): boolean {
  const m = (mime || "").toLowerCase();
  const f = (filename || "").toLowerCase();
  return m.includes("xml") || f.endsWith(".xml");
}

function looksLikeEinvoiceXml(base64: string): boolean {
  try {
    parseEinvoiceXml(Buffer.from(base64, "base64").toString("utf8"));
    return true;
  } catch {
    return false;
  }
}

function classifyGroup(mime: string, filename: string): {
  group: BulkItemKindGroup;
  kind: Att["kind"];
  bucket: BulkBucket;
  confidence: number;
  reason: string;
} {
  const lc = (filename || "").toLowerCase();
  const isPdf = mime === "application/pdf";
  const isImg = mime.startsWith("image/");
  const isXlsx =
    mime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    mime === "application/vnd.ms-excel";
  const isCsv = mime === "text/csv" || lc.endsWith(".csv");

  if (isXmlFile(mime, filename)) {
    return {
      group: "purchase_invoice",
      kind: "purchase_invoice",
      bucket: "review",
      confidence: 0.6,
      reason: "XML hoá đơn điện tử — đang kiểm tra MST để xác định đầu vào/đầu ra",
    };
  }

  if (RX_STATEMENT.test(lc) && (isPdf || isXlsx || isCsv)) {
    return {
      group: "bank_statement",
      kind: "bank_statement",
      bucket: "review",
      confidence: 0.92,
      reason: "Tên file gợi ý sao kê — cần chọn TK để import",
    };
  }
  if (isPdf) {
    if (RX_INVOICE_OUT.test(lc)) {
      return {
        group: "sales_invoice",
        kind: "purchase_invoice",
        bucket: "review",
        confidence: 0.55,
        reason: "Tên file gợi ý HĐ ra — chờ AI xác nhận",
      };
    }
    if (RX_INVOICE_IN.test(lc)) {
      return {
        group: "purchase_invoice",
        kind: "purchase_invoice",
        bucket: "review",
        confidence: 0.6,
        reason: "Tên file gợi ý HĐ vào — chờ AI xác nhận",
      };
    }
    // PDF không có gợi ý từ tên → KHÔNG mặc định là HĐ vào nữa
    return {
      group: "other",
      kind: "auto",
      bucket: "ask",
      confidence: 0.25,
      reason: "PDF chưa rõ loại — chờ AI phân loại",
    };
  }
  if (isImg) {
    return {
      group: "invoice_image",
      kind: "purchase_invoice",
      bucket: "ask",
      confidence: 0.4,
      reason: "Ảnh chụp — chờ AI xác nhận có phải HĐ không",
    };
  }
  if (isXlsx || isCsv) {
    if (RX_PAYROLL.test(lc)) {
      return {
        group: "excel_unknown",
        kind: "auto",
        bucket: "ask",
        confidence: 0.5,
        reason: "File Excel có thể là bảng lương — cần xác nhận",
      };
    }
    return {
      group: "excel_unknown",
      kind: "auto",
      bucket: "ask",
      confidence: 0.4,
      reason: "File Excel chưa rõ nội dung",
    };
  }
  return {
    group: "other",
    kind: "auto",
    bucket: "ask",
    confidence: 0.3,
    reason: "Định dạng lạ — cần kiểm tra",
  };
}

async function ensureUploadQuick(opts: {
  supabase: any;
  userId: string;
  base64: string;
  fileBuf: Buffer;
  fileHash: string;
  filename: string;
  mime: string;
  kind: string;
}): Promise<{ uploadId: string | null; isDup: boolean; dupFilename: string | null }> {
  try {
    const { data: existing } = await opts.supabase
      .from("ai_uploads")
      .select("id, filename, kind, file_path")
      .eq("user_id", opts.userId)
      .eq("file_hash", opts.fileHash)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existing?.id && existing.file_path) {
      return {
        uploadId: existing.id,
        isDup: true,
        dupFilename: existing.filename ?? null,
      };
    }

    const safeName = (opts.filename || "file").replace(/[^\w.\-]+/g, "_");
    const path = `${opts.userId}/ai-uploads/${Date.now()}-${safeName}`;
    const { error: upErr } = await opts.supabase.storage
      .from("invoices")
      .upload(path, opts.fileBuf, { contentType: opts.mime, upsert: false });
    if (upErr) {
      console.error("[bulk-intake] storage upload failed", upErr);
    }

    // Backfill existing row with missing file_path, or insert new
    if (existing?.id && !existing.file_path) {
      await opts.supabase
        .from("ai_uploads")
        .update({ file_path: upErr ? null : path })
        .eq("id", existing.id);
      return { uploadId: existing.id, isDup: false, dupFilename: null };
    }

    const { data: row } = await opts.supabase
      .from("ai_uploads")
      .insert({
        user_id: opts.userId,
        file_path: upErr ? null : path,
        mime_type: opts.mime,
        filename: opts.filename,
        kind: opts.kind,
        file_hash: opts.fileHash,
        status: "uploaded",
      })
      .select("id")
      .maybeSingle();

    return { uploadId: row?.id ?? null, isDup: false, dupFilename: null };
  } catch (e: any) {
    console.warn("[bulk-intake] ensureUploadQuick:", e?.message);
    return { uploadId: null, isDup: false, dupFilename: null };
  }
}

export async function buildBulkPlan(opts: {
  supabase: any;
  userId: string;
  attachments: Att[];
}): Promise<BulkPlan> {
  const items: BulkItem[] = [];
  const duplicates: BulkItem[] = [];
  const groupCounts: Record<BulkItemKindGroup, number> = {
    purchase_invoice: 0,
    sales_invoice: 0,
    bank_statement: 0,
    invoice_image: 0,
    excel_unknown: 0,
    other: 0,
  };

  // ---- Phase 1: hash + dedupe + upload (tuần tự để tránh đụng storage) ----
  type Pending = {
    att: Att;
    baseItem: BulkItem;
    cls: ReturnType<typeof classifyGroup>;
    uploadId: string | null;
    shouldAi: boolean;
  };
  const pendings: Pending[] = [];
  const seenInBatch = new Set<string>();

  for (let i = 0; i < opts.attachments.length; i++) {
    const att = opts.attachments[i];
    const fileBuf = Buffer.from(att.base64, "base64");
    const fileHash = await hashBase64(att.base64);
    const cls = classifyGroup(att.mime, att.name);
    const baseItem: BulkItem = {
      id: `item_${i}_${fileHash.slice(0, 8)}`,
      filename: att.name,
      mime: att.mime,
      size: fileBuf.length,
      group: cls.group,
      kind: cls.kind,
      bucket: cls.bucket,
      reason: cls.reason,
      confidence: cls.confidence,
      uploadId: null,
      fileHash,
    };

    if (seenInBatch.has(fileHash)) {
      duplicates.push({
        ...baseItem,
        dupOf: { reason: "Trùng với file khác trong cùng lần upload này" },
      });
      continue;
    }
    seenInBatch.add(fileHash);

    const up = await ensureUploadQuick({
      supabase: opts.supabase,
      userId: opts.userId,
      base64: att.base64,
      fileBuf,
      fileHash,
      filename: att.name,
      mime: att.mime,
      kind: cls.kind,
    });

    if (up.isDup) {
      duplicates.push({
        ...baseItem,
        uploadId: up.uploadId,
        dupOf: {
          filename: up.dupFilename,
          uploadId: up.uploadId,
          reason: up.dupFilename
            ? `Đã có trước đó (${up.dupFilename})`
            : "Đã có trong hệ thống",
        },
      });
      continue;
    }

    const shouldAi =
      att.mime === "application/pdf" ||
      att.mime.startsWith("image/") ||
      att.mime.includes("spreadsheet") ||
      att.mime === "application/vnd.ms-excel" ||
      isXmlFile(att.mime, att.name) ||
      looksLikeEinvoiceXml(att.base64);

    pendings.push({
      att,
      baseItem: { ...baseItem, uploadId: up.uploadId },
      cls,
      uploadId: up.uploadId,
      shouldAi,
    });
  }

  // ---- Phase 2: classify song song (concurrency 4) ----
  const CONCURRENCY = 4;
  const finalized: BulkItem[] = new Array(pendings.length);

  async function runOne(idx: number) {
    const p = pendings[idx];
    let finalGroup = p.cls.group;
    let finalKind = p.cls.kind;
    let finalBucket = p.cls.bucket;
    let finalReason = p.cls.reason;
    let finalConfidence = p.cls.confidence;
    let finalSource: BulkItem["source"] = "heuristic";

    if (p.shouldAi) {
      try {
        const ai = await classifyFile({
          supabase: opts.supabase,
          userId: opts.userId,
          filename: p.att.name,
          mime: p.att.mime,
          base64: p.att.base64,
          fileHash: p.baseItem.fileHash,
        });
        finalGroup = kindToGroup(ai.kind);
        finalKind = kindToItemKind(ai.kind);
        finalConfidence = ai.confidence;
        finalSource = ai.source;
        finalReason =
          ai.kind === "other"
            ? `Không phải chứng từ kế toán — ${ai.reason}`
            : ai.kind === "sales_invoice"
              ? `HĐ đầu ra — ${ai.reason}`
              : ai.kind === "bank_statement"
                ? `Sao kê NH — ${ai.reason}`
                : ai.kind === "cash_voucher"
                  ? `Phiếu thu/chi — ${ai.reason}`
                  : ai.reason;

        if (ai.kind === "other") {
          finalBucket = "ask";
        } else if (
          ai.kind === "sales_invoice" ||
          ai.kind === "bank_statement" ||
          ai.kind === "cash_voucher"
        ) {
          finalBucket = "review";
        } else if (ai.kind === "purchase_invoice") {
          if (ai.confidence >= 0.85) finalBucket = "auto";
          else if (ai.confidence >= 0.5) finalBucket = "review";
          else finalBucket = "ask";
        }
      } catch (e: any) {
        console.warn("[bulk-intake] classify err:", e?.message);
        finalBucket = "ask";
        finalSource = "heuristic-fallback";
        finalReason = `${p.cls.reason} (AI phân loại lỗi — cần sếp xác nhận)`;
      }
    }

    finalized[idx] = {
      ...p.baseItem,
      group: finalGroup,
      kind: finalKind,
      bucket: finalBucket,
      reason: finalReason,
      confidence: finalConfidence,
      source: finalSource,
    };
  }

  // Pool concurrency đơn giản
  let cursor = 0;
  const workers = Array.from({ length: Math.min(CONCURRENCY, pendings.length) }, async () => {
    while (true) {
      const my = cursor++;
      if (my >= pendings.length) return;
      await runOne(my);
    }
  });
  await Promise.all(workers);

  for (const it of finalized) {
    items.push(it);
    groupCounts[it.group]++;
  }

  // ETA: ~12 sec per auto item (parse + post)
  const autoCount = items.filter((it) => it.bucket === "auto").length;
  const etaSec = Math.max(15, autoCount * 12);

  return { items, duplicates, groupCounts, etaSec };
}
