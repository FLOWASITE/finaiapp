import { gunzipSync } from "zlib";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { SupabaseClient } from "@supabase/supabase-js";

export type DocUrlResult = {
  url: string;
  expires_in: number;
  source: "direct" | "decompressed" | "archive";
};

export async function resolveDocumentUrl(
  supabase: SupabaseClient<any>,
  userId: string,
  docId: string,
  expiresIn = 300,
): Promise<DocUrlResult> {
  const { data: doc, error } = await supabase
    .from("documents")
    .select(
      "id, tenant_id, storage_bucket, storage_path, compressed, storage_tier, mime_type, original_filename",
    )
    .eq("id", docId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!doc) throw new Error("Không tìm thấy tài liệu");
  if (!doc.storage_bucket || !doc.storage_path)
    throw new Error("Tài liệu không có file gốc");

  await supabase
    .rpc("mark_document_accessed", { p_document_id: docId })
    .then(() => undefined, () => undefined);

  const isArchived =
    doc.storage_tier === "archived" || doc.storage_bucket === "einvoices-archive";

  if (!doc.compressed && !isArchived) {
    const { data: signed, error: sErr } = await supabase.storage
      .from(doc.storage_bucket)
      .createSignedUrl(doc.storage_path, expiresIn);
    if (sErr || !signed?.signedUrl)
      throw new Error(sErr?.message || "Không tạo được signed URL");
    return { url: signed.signedUrl, expires_in: expiresIn, source: "direct" };
  }

  const { data: blob, error: dlErr } = await supabaseAdmin.storage
    .from(doc.storage_bucket)
    .download(doc.storage_path);
  if (dlErr || !blob) throw new Error(dlErr?.message || "Không tải được file");

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
  const tmpPath = `_tmp/${userId}/${docId}-${nonce}.${ext}`;

  const { error: upErr } = await supabaseAdmin.storage
    .from("invoices")
    .upload(tmpPath, payload, { contentType: mime, upsert: true });
  if (upErr) throw new Error(`Upload tạm thất bại: ${upErr.message}`);

  const { data: signed, error: sErr } = await supabaseAdmin.storage
    .from("invoices")
    .createSignedUrl(tmpPath, expiresIn);
  if (sErr || !signed?.signedUrl)
    throw new Error(sErr?.message || "Không tạo được signed URL");

  return {
    url: signed.signedUrl,
    expires_in: expiresIn,
    source: isArchived ? "archive" : "decompressed",
  };
}
