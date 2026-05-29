import { createFileRoute } from "@tanstack/react-router";
import { gzipSync } from "zlib";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const WARM_BUCKET = "invoices";
const ARCHIVE_BUCKET = "einvoices-archive";

const WARM_AGE_MONTHS = 12;
const ARCHIVE_AGE_MONTHS = 60;
const BATCH_SIZE = 50;

function monthsAgo(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d.toISOString();
}

function buildCanonicalPath(doc: {
  tenant_id: string;
  invoice_id: string | null;
  sales_invoice_id: string | null;
  einvoice_id: string | null;
  id: string;
  created_at: string;
  mime_type: string | null;
  original_filename: string | null;
}, compressed: boolean): string {
  const d = new Date(doc.created_at);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const invId =
    doc.invoice_id ?? doc.sales_invoice_id ?? doc.einvoice_id ?? doc.id;
  const mime = (doc.mime_type ?? "").toLowerCase();
  const isXml =
    mime.includes("xml") || (doc.original_filename ?? "").toLowerCase().endsWith(".xml");
  const isPdf =
    mime.includes("pdf") || (doc.original_filename ?? "").toLowerCase().endsWith(".pdf");
  const kind = isXml ? "xml" : isPdf ? "pdf" : "file";
  const ext = isXml ? "xml" : isPdf ? "pdf" : "bin";
  return `${doc.tenant_id}/${year}/${month}/${invId}/${kind}.${ext}${compressed ? ".gz" : ""}`;
}

async function processWarm(): Promise<{ ok: number; failed: number; errors: string[] }> {
  const errors: string[] = [];
  let ok = 0;
  let failed = 0;
  const cutoff = monthsAgo(WARM_AGE_MONTHS);
  const archiveCutoff = monthsAgo(ARCHIVE_AGE_MONTHS);

  const { data: docs, error } = await supabaseAdmin
    .from("documents")
    .select(
      "id, tenant_id, invoice_id, sales_invoice_id, einvoice_id, storage_bucket, storage_path, mime_type, original_filename, created_at, size_bytes",
    )
    .eq("storage_tier", "hot")
    .eq("compressed", false)
    .lt("created_at", cutoff)
    .gte("created_at", archiveCutoff)
    .or("mime_type.ilike.%xml%,original_filename.ilike.%.xml")
    .limit(BATCH_SIZE);

  if (error) throw new Error(`warm query: ${error.message}`);

  for (const doc of docs ?? []) {
    try {
      const { data: blob, error: dlErr } = await supabaseAdmin.storage
        .from(doc.storage_bucket)
        .download(doc.storage_path);
      if (dlErr || !blob) throw new Error(dlErr?.message || "download failed");
      const buf = Buffer.from(await blob.arrayBuffer());
      const gz = gzipSync(buf);
      const newPath = buildCanonicalPath(doc as any, true);

      const { error: upErr } = await supabaseAdmin.storage
        .from(WARM_BUCKET)
        .upload(newPath, gz, {
          contentType: "application/gzip",
          upsert: true,
        });
      if (upErr) throw new Error(`upload: ${upErr.message}`);

      const { error: updErr } = await supabaseAdmin
        .from("documents")
        .update({
          storage_bucket: WARM_BUCKET,
          storage_path: newPath,
          canonical_path: newPath,
          storage_tier: "warm",
          compressed: true,
          size_bytes: gz.byteLength,
        })
        .eq("id", doc.id);
      if (updErr) throw new Error(`update: ${updErr.message}`);

      if (doc.storage_path !== newPath || doc.storage_bucket !== WARM_BUCKET) {
        await supabaseAdmin.storage
          .from(doc.storage_bucket)
          .remove([doc.storage_path]);
      }
      ok++;
    } catch (e: any) {
      failed++;
      errors.push(`warm ${doc.id}: ${e.message ?? String(e)}`);
    }
  }
  return { ok, failed, errors };
}

async function processArchive(): Promise<{ ok: number; failed: number; errors: string[] }> {
  const errors: string[] = [];
  let ok = 0;
  let failed = 0;
  const cutoff = monthsAgo(ARCHIVE_AGE_MONTHS);

  const { data: docs, error } = await supabaseAdmin
    .from("documents")
    .select(
      "id, tenant_id, invoice_id, sales_invoice_id, einvoice_id, storage_bucket, storage_path, mime_type, original_filename, created_at, compressed, size_bytes",
    )
    .in("storage_tier", ["hot", "warm"])
    .is("archived_at", null)
    .lt("created_at", cutoff)
    .limit(BATCH_SIZE);

  if (error) throw new Error(`archive query: ${error.message}`);

  for (const doc of docs ?? []) {
    try {
      const { data: blob, error: dlErr } = await supabaseAdmin.storage
        .from(doc.storage_bucket)
        .download(doc.storage_path);
      if (dlErr || !blob) throw new Error(dlErr?.message || "download failed");

      let payload = Buffer.from(await blob.arrayBuffer());
      let compressed = !!doc.compressed;
      const isXml =
        (doc.mime_type ?? "").toLowerCase().includes("xml") ||
        (doc.original_filename ?? "").toLowerCase().endsWith(".xml");
      if (!compressed && isXml) {
        payload = gzipSync(payload);
        compressed = true;
      }

      const newPath = buildCanonicalPath(doc as any, compressed);

      const { error: upErr } = await supabaseAdmin.storage
        .from(ARCHIVE_BUCKET)
        .upload(newPath, payload, {
          contentType: compressed ? "application/gzip" : (doc.mime_type ?? "application/octet-stream"),
          upsert: true,
        });
      if (upErr) throw new Error(`upload: ${upErr.message}`);

      const { error: updErr } = await supabaseAdmin
        .from("documents")
        .update({
          storage_bucket: ARCHIVE_BUCKET,
          storage_path: newPath,
          canonical_path: newPath,
          storage_tier: "archived",
          compressed,
          archived_at: new Date().toISOString(),
          size_bytes: payload.byteLength,
        })
        .eq("id", doc.id);
      if (updErr) throw new Error(`update: ${updErr.message}`);

      await supabaseAdmin.storage
        .from(doc.storage_bucket)
        .remove([doc.storage_path]);

      ok++;
    } catch (e: any) {
      failed++;
      errors.push(`archive ${doc.id}: ${e.message ?? String(e)}`);
    }
  }
  return { ok, failed, errors };
}

async function cleanupTempFiles(): Promise<number> {
  // Remove _tmp/* objects older than 1h
  const cutoff = Date.now() - 60 * 60 * 1000;
  let removed = 0;
  try {
    const { data: entries } = await supabaseAdmin.storage
      .from(WARM_BUCKET)
      .list("_tmp", { limit: 1000 });
    const toRemove: string[] = [];
    for (const e of entries ?? []) {
      const ts = e.created_at ? new Date(e.created_at).getTime() : 0;
      if (ts && ts < cutoff) toRemove.push(`_tmp/${e.name}`);
    }
    if (toRemove.length) {
      await supabaseAdmin.storage.from(WARM_BUCKET).remove(toRemove);
      removed = toRemove.length;
    }
  } catch {
    // ignore
  }
  return removed;
}

export const Route = createFileRoute("/api/public/hooks/archive-documents")({
  server: {
    handlers: {
      POST: async () => {
        try {
          const warm = await processWarm();
          const archive = await processArchive();
          const tmpRemoved = await cleanupTempFiles();
          return Response.json({
            ok: true,
            warm,
            archive,
            tmp_removed: tmpRemoved,
          });
        } catch (e: any) {
          console.error("archive-documents failed:", e);
          return Response.json(
            { ok: false, error: e?.message ?? String(e) },
            { status: 500 },
          );
        }
      },
    },
  },
});
