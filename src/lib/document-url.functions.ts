import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { gunzipSync } from "zlib";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * getDocumentUrl(doc_id)
 *
 * Trả signed URL (5 phút) cho file gốc của document.
 * - Nếu compressed=true hoặc đang ở bucket archive → tự gunzip + upload bản tạm
 *   vào bucket "invoices" tại path `_tmp/{userId}/{docId}-{nonce}.{ext}` rồi sign.
 *   File tạm sẽ bị cron `archive-documents` dọn sau 1h.
 * - Cập nhật `last_accessed_at` qua RPC `mark_document_accessed`.
 */
export const getDocumentUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        docId: z.string().uuid(),
        expiresIn: z.number().int().min(30).max(3600).default(300),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // 1. Load document (RLS scope: phải thuộc tenant user)
    const { data: doc, error } = await supabase
      .from("documents")
      .select(
        "id, tenant_id, storage_bucket, storage_path, compressed, storage_tier, mime_type, original_filename",
      )
      .eq("id", data.docId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!doc) throw new Error("Không tìm thấy tài liệu");
    if (!doc.storage_bucket || !doc.storage_path)
      throw new Error("Tài liệu không có file gốc");

    // 2. Mark accessed (best-effort)
    await supabase.rpc("mark_document_accessed", { p_document_id: data.docId }).then(
      () => undefined,
      () => undefined,
    );

    const isArchived =
      doc.storage_tier === "archived" || doc.storage_bucket === "einvoices-archive";

    // 3. Fast path: hot, không nén, không archived
    if (!doc.compressed && !isArchived) {
      const { data: signed, error: sErr } = await supabase.storage
        .from(doc.storage_bucket)
        .createSignedUrl(doc.storage_path, data.expiresIn);
      if (sErr || !signed?.signedUrl)
        throw new Error(sErr?.message || "Không tạo được signed URL");
      return { url: signed.signedUrl, expires_in: data.expiresIn, source: "direct" };
    }

    // 4. Cần decompress (hoặc đọc từ archive bucket private) → admin client
    const { data: blob, error: dlErr } = await supabaseAdmin.storage
      .from(doc.storage_bucket)
      .download(doc.storage_path);
    if (dlErr || !blob)
      throw new Error(dlErr?.message || "Không tải được file");

    let payload = Buffer.from(await blob.arrayBuffer());
    if (doc.compressed) {
      try {
        payload = gunzipSync(payload);
      } catch (e: any) {
        throw new Error(`Giải nén thất bại: ${e?.message ?? String(e)}`);
      }
    }

    const lowerName = (doc.original_filename ?? "").toLowerCase();
    const ext = lowerName.endsWith(".pdf")
      ? "pdf"
      : lowerName.endsWith(".xml") ||
          (doc.mime_type ?? "").toLowerCase().includes("xml")
        ? "xml"
        : "bin";
    const mime =
      ext === "pdf"
        ? "application/pdf"
        : ext === "xml"
          ? "application/xml"
          : (doc.mime_type ?? "application/octet-stream");

    const nonce = Math.random().toString(36).slice(2, 10);
    const tmpPath = `_tmp/${userId}/${data.docId}-${nonce}.${ext}`;

    const { error: upErr } = await supabaseAdmin.storage
      .from("invoices")
      .upload(tmpPath, payload, { contentType: mime, upsert: true });
    if (upErr) throw new Error(`Upload tạm thất bại: ${upErr.message}`);

    const { data: signed, error: sErr } = await supabaseAdmin.storage
      .from("invoices")
      .createSignedUrl(tmpPath, data.expiresIn);
    if (sErr || !signed?.signedUrl)
      throw new Error(sErr?.message || "Không tạo được signed URL");

    return {
      url: signed.signedUrl,
      expires_in: data.expiresIn,
      source: isArchived ? "archive" : "decompressed",
    };
  });
