/**
 * Server-only: load an ai_uploads row + its file bytes from Storage as base64,
 * scoped to the calling user. Used by bulk-run to re-parse uploaded files
 * without round-tripping base64 from the client.
 */
export async function loadUploadAsBase64(
  supabase: any,
  userId: string,
  uploadId: string,
): Promise<{ base64: string; mime: string; filename: string; kind: string; filePath: string } | null> {
  const { data: row, error } = await supabase
    .from("ai_uploads")
    .select("file_path, mime_type, filename, kind, user_id")
    .eq("id", uploadId)
    .maybeSingle();
  if (error || !row) return null;
  if (row.user_id !== userId) return null;
  if (!row.file_path) return null;

  const { data: blob, error: dErr } = await supabase.storage
    .from("invoices")
    .download(row.file_path);
  if (dErr || !blob) return null;

  const buf = Buffer.from(await blob.arrayBuffer());
  return {
    base64: buf.toString("base64"),
    mime: row.mime_type,
    filename: row.filename ?? "file",
    kind: row.kind ?? "auto",
    filePath: row.file_path,
  };
}
