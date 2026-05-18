import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const ALLOWED_DOC_TABLES = [
  "invoices",
  "sales_invoices",
  "einvoices",
  "cash_vouchers",
  "bank_vouchers",
  "customer_receipts",
  "supplier_payments",
] as const;
export type DocTable = (typeof ALLOWED_DOC_TABLES)[number];

export const DOC_STATUSES = [
  "uploaded",
  "ai_read",
  "reviewed",
  "posted",
  "void",
  "rejected",
] as const;
export type DocStatus = (typeof DOC_STATUSES)[number];

const TableEnum = z.enum(ALLOWED_DOC_TABLES);
const StatusEnum = z.enum(DOC_STATUSES);

export const transitionStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        table: TableEnum,
        id: z.string().uuid(),
        to_status: StatusEnum,
        reason: z.string().max(500).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("transition_document_status", {
      p_table: data.table,
      p_id: data.id,
      p_to_status: data.to_status,
      p_reason: data.reason,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listDocuments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        search: z.string().max(200).optional(),
        doc_kind: z.string().max(50).optional(),
        ocr_status: z.string().max(50).optional(),
        limit: z.number().int().min(1).max(200).default(50),
        offset: z.number().int().min(0).default(0),
      })
      .parse(i ?? {}),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("documents")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(data.offset, data.offset + data.limit - 1);
    if (data.search) q = q.ilike("original_filename", `%${data.search}%`);
    if (data.doc_kind) q = q.eq("doc_kind", data.doc_kind);
    if (data.ocr_status) q = q.eq("ocr_status", data.ocr_status);
    const { data: rows, error, count } = await q;
    if (error) throw new Error(error.message);
    return { rows: rows ?? [], total: count ?? 0 };
  });

export const getDocument = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: doc, error } = await context.supabase
      .from("documents")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!doc) throw new Error("Không tìm thấy tài liệu");
    const { data: links } = await context.supabase
      .from("document_links")
      .select("*")
      .eq("document_id", data.id);
    let signedUrl: string | null = null;
    if (doc.storage_bucket && doc.storage_path) {
      const { data: signed } = await context.supabase.storage
        .from(doc.storage_bucket)
        .createSignedUrl(doc.storage_path, 60 * 30);
      signedUrl = signed?.signedUrl ?? null;
    }
    return { doc, links: links ?? [], signedUrl };
  });

export const getStatusHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        entity_table: TableEnum,
        entity_id: z.string().uuid(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("document_status_history")
      .select("*")
      .eq("entity_table", data.entity_table)
      .eq("entity_id", data.entity_id)
      .order("changed_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const deleteDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { count } = await context.supabase
      .from("document_links")
      .select("document_id", { count: "exact", head: true })
      .eq("document_id", data.id);
    if ((count ?? 0) > 0) {
      throw new Error("Tài liệu đang được liên kết với chứng từ — gỡ liên kết trước khi xoá.");
    }
    const { data: doc } = await context.supabase
      .from("documents")
      .select("storage_bucket,storage_path")
      .eq("id", data.id)
      .maybeSingle();
    const { error } = await context.supabase.from("documents").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    if (doc?.storage_bucket && doc?.storage_path) {
      await context.supabase.storage.from(doc.storage_bucket).remove([doc.storage_path]);
    }
    return { ok: true };
  });

// ===== Document <-> entity links =====
const EntityRefSchema = z.object({
  entity_table: TableEnum,
  entity_id: z.string().uuid(),
});

export const listLinkedDocuments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => EntityRefSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { data: links, error } = await context.supabase
      .from("document_links")
      .select("document_id, link_type, created_at, documents!inner(id, original_filename, doc_kind, mime_type, size_bytes, storage_bucket, storage_path, ocr_status, created_at)")
      .eq("entity_table", data.entity_table)
      .eq("entity_id", data.entity_id)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { rows: links ?? [] };
  });

export const listAttachableDocuments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        entity_table: TableEnum,
        entity_id: z.string().uuid(),
        search: z.string().max(200).optional(),
        doc_kind: z.string().max(50).optional(),
        limit: z.number().int().min(1).max(100).default(30),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: existing } = await context.supabase
      .from("document_links")
      .select("document_id")
      .eq("entity_table", data.entity_table)
      .eq("entity_id", data.entity_id);
    const excluded = (existing ?? []).map((l: any) => l.document_id);

    let q = context.supabase
      .from("documents")
      .select("id, original_filename, doc_kind, mime_type, size_bytes, ocr_status, created_at")
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.search) q = q.ilike("original_filename", `%${data.search}%`);
    if (data.doc_kind) q = q.eq("doc_kind", data.doc_kind);
    if (excluded.length > 0) q = q.not("id", "in", `(${excluded.join(",")})`);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { rows: rows ?? [] };
  });

export const linkDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        document_id: z.string().uuid(),
        entity_table: TableEnum,
        entity_id: z.string().uuid(),
        link_type: z.string().max(50).default("attachment"),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("document_links")
      .insert({
        document_id: data.document_id,
        entity_table: data.entity_table,
        entity_id: data.entity_id,
        link_type: data.link_type,
      });
    if (error && !/duplicate|unique/i.test(error.message)) throw new Error(error.message);
    return { ok: true };
  });

export const unlinkDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        document_id: z.string().uuid(),
        entity_table: TableEnum,
        entity_id: z.string().uuid(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("document_links")
      .delete()
      .eq("document_id", data.document_id)
      .eq("entity_table", data.entity_table)
      .eq("entity_id", data.entity_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
