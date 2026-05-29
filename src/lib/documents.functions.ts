import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertTenantMember } from "@/lib/auth/active-tenant.server";
import { withTenant } from "@/integrations/supabase/with-tenant";

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
  .middleware([withTenant])
  .inputValidator((i: unknown) =>
    z
      .object({
        search: z.string().max(200).optional(),
        doc_kind: z.string().max(50).optional(),
        source: z.string().max(50).optional(),
        ocr_status: z.string().max(50).optional(),
        from_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        to_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        limit: z.number().int().min(1).max(200).default(50),
        offset: z.number().int().min(0).default(0),
      })
      .parse(i ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { tenantId } = context;
    let q = context.supabase
      .from("documents")
      .select("*", { count: "exact" })
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .range(data.offset, data.offset + data.limit - 1);
    if (data.search) q = q.ilike("original_filename", `%${data.search}%`);
    if (data.doc_kind) q = q.eq("doc_kind", data.doc_kind);
    if (data.source) q = q.eq("source", data.source);
    if (data.ocr_status) q = q.eq("ocr_status", data.ocr_status);
    if (data.from_date) q = q.gte("created_at", `${data.from_date}T00:00:00Z`);
    if (data.to_date) q = q.lte("created_at", `${data.to_date}T23:59:59Z`);
    const { data: rows, error, count } = await q;
    if (error) throw new Error(error.message);

    // Đính kèm trạng thái hạch toán
    const invIds = Array.from(
      new Set(((rows ?? []) as any[]).map((r) => r.invoice_id).filter(Boolean)),
    );
    const propMap = new Map<string, any>();
    if (invIds.length > 0) {
      const { data: props } = await context.supabase
        .from("ai_journal_proposals")
        .select("invoice_id, status, confidence, source, journal_entry_id, auto_posted")
        .in("invoice_id", invIds);
      for (const p of (props ?? []) as any[]) propMap.set(p.invoice_id, p);
    }
    const annotated = ((rows ?? []) as any[]).map((r) => ({
      ...r,
      categorize: r.invoice_id ? propMap.get(r.invoice_id) ?? null : null,
    }));
    return { rows: annotated, total: count ?? 0 };
  });


export const listPurchaseDocuments = createServerFn({ method: "GET" })
  .middleware([withTenant])
  .inputValidator((i: unknown) =>
    z
      .object({
        search: z.string().max(200).optional(),
        source: z.string().max(50).optional(),
        ocr_status: z.string().max(50).optional(),
        from_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        to_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        invoice_no: z.string().max(100).optional(),
        supplier_search: z.string().max(200).optional(),
        issue_from_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        issue_to_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        limit: z.number().int().min(1).max(200).default(50),
        offset: z.number().int().min(0).default(0),
      })
      .parse(i ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { tenantId } = context;
    let q = context.supabase
      .from("documents")
      .select("*", { count: "exact" })
      .eq("tenant_id", tenantId)
      .eq("doc_kind", "purchase_invoice")
      .order("created_at", { ascending: false });
    if (data.search) q = q.ilike("original_filename", `%${data.search}%`);
    if (data.source) q = q.eq("source", data.source);
    if (data.ocr_status) q = q.eq("ocr_status", data.ocr_status);
    if (data.from_date) q = q.gte("created_at", `${data.from_date}T00:00:00Z`);
    if (data.to_date) q = q.lte("created_at", `${data.to_date}T23:59:59Z`);

    // Fetch a generous buffer so invoice-level filters still return enough rows
    const bufferLimit = Math.min(data.limit * 8, 2000);
    q = q.range(data.offset, data.offset + bufferLimit - 1);

    const { data: docs, error, count } = await q;
    if (error) throw new Error(error.message);
    const docList = docs ?? [];
    if (docList.length === 0) return { rows: [], total: count ?? 0 };

    const docIds = docList.map((d: any) => d.id);
    const { data: links } = await context.supabase
      .from("document_links")
      .select("document_id, entity_id, entity_table")
      .in("document_id", docIds)
      .eq("entity_table", "invoices");
    const invIds = Array.from(new Set((links ?? []).map((l: any) => l.entity_id)));

    let invoicesById: Record<string, any> = {};
    let linesByInvoice: Record<string, any[]> = {};
    if (invIds.length > 0) {
      const { data: invs } = await context.supabase
        .from("invoices")
        .select("id, invoice_no, issue_date, supplier_name, supplier_tax_id, subtotal, vat_amount, total, status, payment_status")
        .in("id", invIds);
      invoicesById = Object.fromEntries((invs ?? []).map((i: any) => [i.id, i]));
      const { data: lines } = await context.supabase
        .from("invoice_lines")
        .select("invoice_id, description, qty, unit_price, amount, vat_rate")
        .in("invoice_id", invIds);
      for (const l of lines ?? []) {
        (linesByInvoice[l.invoice_id] ||= []).push(l);
      }
    }

    // Lookup posted vouchers (Phiếu mua hàng + Phiếu nhập kho)
    const pvByInvoice: Record<string, { voucher_no: string; stock_voucher_no: string | null }> = {};
    if (invIds.length > 0) {
      const { data: pvs } = await context.supabase
        .from("purchase_vouchers")
        .select("invoice_id, voucher_no, status, stock_voucher_id")
        .in("invoice_id", invIds)
        .neq("status", "void");
      const stockIds = Array.from(
        new Set(((pvs ?? []) as any[]).map((p) => p.stock_voucher_id).filter(Boolean)),
      );
      const stockMap: Record<string, string> = {};
      if (stockIds.length > 0) {
        const { data: svs } = await context.supabase
          .from("stock_vouchers")
          .select("id, voucher_no")
          .in("id", stockIds);
        for (const s of (svs ?? []) as any[]) stockMap[s.id] = s.voucher_no;
      }
      for (const p of (pvs ?? []) as any[]) {
        pvByInvoice[p.invoice_id] = {
          voucher_no: p.voucher_no,
          stock_voucher_no: p.stock_voucher_id ? (stockMap[p.stock_voucher_id] ?? null) : null,
        };
      }
    }

    const docToInv: Record<string, string> = {};
    for (const l of links ?? []) docToInv[l.document_id] = l.entity_id;


    const rows = docList.map((d: any) => {
      const invId = docToInv[d.id];
      const inv = invId ? invoicesById[invId] : null;
      const dbLines = invId ? (linesByInvoice[invId] ?? []) : [];
      const ocr = d.ocr_extracted ?? {};
      const ocrLines: any[] = Array.isArray(ocr.lines) ? ocr.lines : [];
      const finalLines =
        dbLines.length > 0
          ? dbLines.map((l: any) => ({
              description: l.description,
              qty: l.qty,
              unit_price: l.unit_price,
              amount: l.amount,
              vat_rate: l.vat_rate,
            }))
          : ocrLines.map((l: any) => ({
              description: l.description ?? "",
              qty: l.qty ?? null,
              unit_price: l.unit_price ?? null,
              amount: l.amount ?? null,
              vat_rate: l.vat_rate ?? null,
            }));
      const firstDesc = finalLines[0]?.description ?? null;
      const lines_summary = firstDesc
        ? finalLines.length > 1
          ? `${firstDesc} +${finalLines.length - 1} dòng`
          : firstDesc
        : null;
      const ocrSupplierName =
        ocr.supplier_name ?? ocr.vendor_name ?? ocr.seller_name ?? null;
      const ocrSupplierTaxId =
        ocr.supplier_tax_id ?? ocr.vendor_tax_id ?? ocr.seller_tax_id ?? null;
      return {
        doc: d,
        invoice: inv
          ? {
              ...inv,
              id: invId,
              supplier_name: inv.supplier_name ?? ocrSupplierName,
              supplier_tax_id: inv.supplier_tax_id ?? ocrSupplierTaxId,
            }
          : {
              id: null,
              invoice_no: ocr.invoice_no ?? null,
              issue_date: ocr.issue_date ?? null,
              supplier_name: ocrSupplierName,
              supplier_tax_id: ocrSupplierTaxId,
              subtotal: ocr.subtotal ?? null,
              vat_amount: ocr.vat_amount ?? null,
              total: ocr.total ?? null,
              status: null,
              payment_status: null,
            },
        lines: finalLines,
        lines_summary,
        posted: invId ? (pvByInvoice[invId] ?? null) : null,
      };

    });

    // Apply invoice-level filters client-side
    const termNo = (data.invoice_no || "").trim().toLowerCase();
    const termSup = (data.supplier_search || "").trim().toLowerCase();
    const issueFrom = data.issue_from_date || "";
    const issueTo = data.issue_to_date || "";

    const filtered = rows.filter((r: any) => {
      const inv = r.invoice;
      if (termNo) {
        const no = String(inv?.invoice_no ?? "").toLowerCase();
        if (!no.includes(termNo)) return false;
      }
      if (termSup) {
        const name = String(inv?.supplier_name ?? "").toLowerCase();
        const tax = String(inv?.supplier_tax_id ?? "").toLowerCase();
        if (!name.includes(termSup) && !tax.includes(termSup)) return false;
      }
      if (issueFrom || issueTo) {
        const d = inv?.issue_date ?? "";
        if (issueFrom && d < issueFrom) return false;
        if (issueTo && d > issueTo) return false;
      }
      return true;
    });

    const paginated = filtered.slice(data.offset, data.offset + data.limit);
    return { rows: paginated, total: filtered.length };
  });

export const listSalesDocuments = createServerFn({ method: "GET" })
  .middleware([withTenant])
  .inputValidator((i: unknown) =>
    z
      .object({
        search: z.string().max(200).optional(),
        source: z.string().max(50).optional(),
        ocr_status: z.string().max(50).optional(),
        from_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        to_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        invoice_no: z.string().max(100).optional(),
        customer_search: z.string().max(200).optional(),
        issue_from_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        issue_to_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        limit: z.number().int().min(1).max(200).default(50),
        offset: z.number().int().min(0).default(0),
      })
      .parse(i ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { tenantId } = context;
    let q = context.supabase
      .from("documents")
      .select("*", { count: "exact" })
      .eq("tenant_id", tenantId)
      .eq("doc_kind", "sales_invoice")
      .order("created_at", { ascending: false });
    if (data.search) q = q.ilike("original_filename", `%${data.search}%`);
    if (data.source) q = q.eq("source", data.source);
    if (data.ocr_status) q = q.eq("ocr_status", data.ocr_status);
    if (data.from_date) q = q.gte("created_at", `${data.from_date}T00:00:00Z`);
    if (data.to_date) q = q.lte("created_at", `${data.to_date}T23:59:59Z`);

    const bufferLimit = Math.min(data.limit * 8, 2000);
    q = q.range(data.offset, data.offset + bufferLimit - 1);

    const { data: docs, error, count } = await q;
    if (error) throw new Error(error.message);
    const docList = docs ?? [];
    if (docList.length === 0) return { rows: [], total: count ?? 0 };

    const docIds = docList.map((d: any) => d.id);
    const { data: links } = await context.supabase
      .from("document_links")
      .select("document_id, entity_id, entity_table")
      .in("document_id", docIds)
      .eq("entity_table", "sales_invoices");
    const invIds = Array.from(new Set((links ?? []).map((l: any) => l.entity_id)));

    let invoicesById: Record<string, any> = {};
    let linesByInvoice: Record<string, any[]> = {};
    if (invIds.length > 0) {
      const { data: invs } = await context.supabase
        .from("sales_invoices")
        .select("id, invoice_no, invoice_series, issue_date, customer_name, customer_tax_id, subtotal, vat_amount, total, status, payment_status, due_date")
        .in("id", invIds);
      invoicesById = Object.fromEntries((invs ?? []).map((i: any) => [i.id, i]));
      const { data: lines } = await context.supabase
        .from("sales_invoice_lines")
        .select("invoice_id, description, qty, unit_price, amount, vat_rate")
        .in("invoice_id", invIds);
      for (const l of lines ?? []) {
        (linesByInvoice[l.invoice_id] ||= []).push(l);
      }
    }

    // Lookup posted sales vouchers (Phiếu bán hàng + Phiếu xuất kho) — match by einvoice_series+no
    const svByInvoiceId: Record<string, { voucher_no: string; stock_voucher_no: string | null }> = {};
    const invList = Object.values(invoicesById) as any[];
    const keyedInvs = invList.filter((i) => i.invoice_no);
    if (keyedInvs.length > 0) {
      const nos = keyedInvs.map((i) => String(i.invoice_no));
      const { data: svs } = await context.supabase
        .from("sales_vouchers")
        .select("voucher_no, status, einvoice_series, einvoice_no, stock_voucher_no")
        .eq("tenant_id", tenantId)
        .in("einvoice_no", nos)
        .neq("status", "void");
      for (const sv of (svs ?? []) as any[]) {
        const match = keyedInvs.find(
          (i) =>
            String(i.invoice_no) === String(sv.einvoice_no) &&
            (!sv.einvoice_series ||
              !i.invoice_series ||
              String(i.invoice_series) === String(sv.einvoice_series)),
        );
        if (match) {
          svByInvoiceId[match.id] = {
            voucher_no: sv.voucher_no,
            stock_voucher_no: sv.stock_voucher_no ?? null,
          };
        }
      }
    }

    const docToInv: Record<string, string> = {};
    for (const l of links ?? []) docToInv[l.document_id] = l.entity_id;


    const rows = docList.map((d: any) => {
      const invId = docToInv[d.id];
      const inv = invId ? invoicesById[invId] : null;
      const dbLines = invId ? (linesByInvoice[invId] ?? []) : [];
      const ocr = d.ocr_extracted ?? {};
      const ocrLines: any[] = Array.isArray(ocr.lines) ? ocr.lines : [];
      const finalLines =
        dbLines.length > 0
          ? dbLines.map((l: any) => ({
              description: l.description,
              qty: l.qty,
              unit_price: l.unit_price,
              amount: l.amount,
              vat_rate: l.vat_rate,
            }))
          : ocrLines.map((l: any) => ({
              description: l.description ?? "",
              qty: l.qty ?? null,
              unit_price: l.unit_price ?? null,
              amount: l.amount ?? null,
              vat_rate: l.vat_rate ?? null,
            }));
      const firstDesc = finalLines[0]?.description ?? null;
      const lines_summary = firstDesc
        ? finalLines.length > 1
          ? `${firstDesc} +${finalLines.length - 1} dòng`
          : firstDesc
        : null;
      const ocrCustomerName = ocr.customer_name ?? ocr.buyer_name ?? null;
      const ocrCustomerTaxId = ocr.customer_tax_id ?? ocr.buyer_tax_id ?? null;
      return {
        doc: d,
        invoice: inv
          ? {
              ...inv,
              id: invId,
              customer_name: inv.customer_name ?? ocrCustomerName,
              customer_tax_id: inv.customer_tax_id ?? ocrCustomerTaxId,
            }
          : {
              id: null,
              invoice_no: ocr.invoice_no ?? null,
              invoice_series: ocr.invoice_series ?? null,
              issue_date: ocr.issue_date ?? null,
              customer_name: ocrCustomerName,
              customer_tax_id: ocrCustomerTaxId,
              subtotal: ocr.subtotal ?? null,
              vat_amount: ocr.vat_amount ?? null,
              total: ocr.total ?? null,
              status: null,
              payment_status: null,
              due_date: null,
            },
        lines: finalLines,
        lines_summary,
        posted: invId ? (svByInvoiceId[invId] ?? null) : null,
      };

    });

    const termNo = (data.invoice_no || "").trim().toLowerCase();
    const termCus = (data.customer_search || "").trim().toLowerCase();
    const issueFrom = data.issue_from_date || "";
    const issueTo = data.issue_to_date || "";

    const filtered = rows.filter((r: any) => {
      const inv = r.invoice;
      if (termNo) {
        const no = String(inv?.invoice_no ?? "").toLowerCase();
        if (!no.includes(termNo)) return false;
      }
      if (termCus) {
        const name = String(inv?.customer_name ?? "").toLowerCase();
        const tax = String(inv?.customer_tax_id ?? "").toLowerCase();
        if (!name.includes(termCus) && !tax.includes(termCus)) return false;
      }
      if (issueFrom || issueTo) {
        const d = inv?.issue_date ?? "";
        if (issueFrom && d < issueFrom) return false;
        if (issueTo && d > issueTo) return false;
      }
      return true;
    });

    const paginated = filtered.slice(data.offset, data.offset + data.limit);
    return { rows: paginated, total: filtered.length };
  });

export const uploadDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        fileBase64: z.string().min(1),
        filename: z.string().min(1).max(255),
        mimeType: z.string().min(3).max(100),
        doc_kind: z.enum([
          "auto",
          "purchase_invoice","sales_invoice","einvoice","cash_voucher","bank_voucher",
          "bank_statement","receipt","payment","contract","other"
        ]),
        notes: z.string().max(1000).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const { data: prof } = await supabase
      .from("profiles").select("active_tenant_id").eq("id", userId).maybeSingle();
    const tenantId = prof?.active_tenant_id;
    if (tenantId) await assertTenantMember(supabase, userId, tenantId);
    if (!tenantId) throw new Error("Chưa chọn doanh nghiệp hoạt động");

    const buf = Buffer.from(data.fileBase64, "base64");
    const safeName = data.filename.replace(/[^\w.\-]+/g, "_");
    const path = `${userId}/manual/${Date.now()}-${safeName}`;
    const { error: upErr } = await supabase.storage
      .from("invoices")
      .upload(path, buf, { contentType: data.mimeType, upsert: false });
    if (upErr) throw new Error(upErr.message);

    const isAuto = data.doc_kind === "auto";
    const { data: row, error: insErr } = await supabase
      .from("documents")
      .insert({
        tenant_id: tenantId,
        user_id: userId,
        doc_kind: isAuto ? "other" : data.doc_kind,
        source: "manual",
        storage_bucket: "invoices",
        storage_path: path,
        original_filename: data.filename,
        mime_type: data.mimeType,
        size_bytes: buf.length,
        ocr_status: "pending",
        notes: data.notes ?? null,
      })
      .select("id")
      .maybeSingle();
    if (insErr) throw new Error(insErr.message);
    const docId = row?.id;
    if (!docId) return { id: undefined, ocr_status: "failed" as const };

    // Auto OCR + parse ngay sau khi upload
    const kindMap: Record<string, "purchase_invoice" | "bank_statement" | "cash_voucher" | "auto"> = {
      purchase_invoice: "purchase_invoice",
      bank_statement: "bank_statement",
      cash_voucher: "cash_voucher",
    };
    const kind = isAuto ? "auto" : (kindMap[data.doc_kind] ?? "auto");

    await supabase.from("documents").update({ ocr_status: "processing" }).eq("id", docId);

    try {
      const { parseFileCore } = await import("@/lib/ai/parse-document.functions");
      const result = await parseFileCore({
        fileBase64: data.fileBase64,
        mimeType: data.mimeType,
        filename: data.filename,
        kind,
        supabase,
        userId,
      });
      // parseFileCore tự cập nhật khi có ai_upload_id; với manual upload chưa có thì update trực tiếp
      const { data: fresh } = await supabase
        .from("documents")
        .select("ai_upload_id")
        .eq("id", docId)
        .maybeSingle();
      if (!fresh?.ai_upload_id) {
        await supabase
          .from("documents")
          .update({
            ocr_status: "done",
            ocr_extracted: typeof result.parsed === "string" ? { raw: result.parsed } : result.parsed,
            ai_upload_id: result.uploadId ?? null,
          })
          .eq("id", docId);
      }
      const { data: finalRow } = await supabase
        .from("documents").select("doc_kind").eq("id", docId).maybeSingle();
      const finalKind = finalRow?.doc_kind ?? (isAuto ? "other" : data.doc_kind);

      // === Đối chiếu MST/tên tổ chức với tenant ===
      const { getTenantIdentity, matchDocumentToTenant } = await import(
        "@/lib/ai/tenant-match.server"
      );
      const tenantIdentity = await getTenantIdentity(supabase, tenantId);
      const match = matchDocumentToTenant(
        typeof result.parsed === "object" ? result.parsed : {},
        finalKind,
        tenantIdentity,
      );

      if (match.status === "reject") {
        // Xoá file khỏi storage để không lưu dữ liệu doanh nghiệp khác
        try {
          await supabase.storage.from("invoices").remove([path]);
        } catch {}
        await supabase
          .from("documents")
          .update({
            ocr_status: "rejected",
            ocr_error: match.reason,
            notes: match.reason.slice(0, 1000),
          })
          .eq("id", docId);
        return {
          id: docId,
          ocr_status: "rejected" as const,
          rejection: match,
          doc_kind: finalKind,
        };
      }

      if (match.status === "warn") {
        await supabase
          .from("documents")
          .update({ notes: match.reason.slice(0, 1000) })
          .eq("id", docId);
      }

      return {
        id: docId,
        ocr_status: "done" as const,
        parser: result.parser,
        pages: result.pages,
        doc_kind: finalKind,
        tenant_match: match.status,
        tenant_match_reason: match.reason,
      };
    } catch (e: any) {
      await supabase
        .from("documents")
        .update({ ocr_status: "failed", ocr_error: e?.message ?? "OCR failed" })
        .eq("id", docId);
      return { id: docId, ocr_status: "failed" as const, error: e?.message ?? "OCR failed" };
    }
  });


export const getDocument = createServerFn({ method: "GET" })
  .middleware([withTenant])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { tenantId } = context;
    const { data: doc, error } = await context.supabase
      .from("documents")
      .select("*")
      .eq("id", data.id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!doc) throw new Error("Không tìm thấy tài liệu");
    const { data: links } = await context.supabase
      .from("document_links")
      .select("*")
      .eq("document_id", data.id);
    let signedUrl: string | null = null;
    if (doc.storage_bucket && doc.storage_path) {
      try {
        const { resolveDocumentUrl } = await import("./document-url.server");
        const res = await resolveDocumentUrl(
          context.supabase as any,
          (context as any).userId,
          doc.id,
          60 * 30,
        );
        signedUrl = res.url;
      } catch {
        signedUrl = null;
      }
    }
    let aiUpload: any = null;
    if (doc.ai_upload_id) {
      const { data: au } = await context.supabase
        .from("ai_uploads")
        .select("id, kind, parser_used, parser_ms, structurer_ms, pages, status, error, file_hash, created_at")
        .eq("id", doc.ai_upload_id)
        .maybeSingle();
      aiUpload = au ?? null;
    }
    let categorize: any = null;
    if (doc.invoice_id) {
      const { data: prop } = await context.supabase
        .from("ai_journal_proposals")
        .select("id, status, confidence, source, journal_entry_id, auto_posted, dto, warnings, created_at, resolved_at")
        .eq("invoice_id", doc.invoice_id)
        .maybeSingle();
      categorize = prop ?? null;
    }
    return { doc, links: links ?? [], signedUrl, aiUpload, categorize };
  });

export const reparseDocument = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId, tenantId } = context as any;
    const { data: doc, error } = await supabase
      .from("documents")
      .select("*")
      .eq("id", data.id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!doc) throw new Error("Không tìm thấy tài liệu");
    if (!doc.storage_bucket || !doc.storage_path) throw new Error("Tài liệu không có file gốc");

    const { data: blob, error: dlErr } = await supabase.storage
      .from(doc.storage_bucket)
      .download(doc.storage_path);
    if (dlErr || !blob) throw new Error(dlErr?.message || "Không tải được file");
    const arrayBuffer = await (blob as Blob).arrayBuffer();
    const fileBase64 = Buffer.from(arrayBuffer).toString("base64");

    const kindMap: Record<string, "purchase_invoice" | "bank_statement" | "cash_voucher" | "auto"> = {
      purchase_invoice: "purchase_invoice",
      bank_statement: "bank_statement",
      cash_voucher: "cash_voucher",
    };
    const kind = kindMap[doc.doc_kind] ?? "auto";

    await supabase.from("documents").update({ ocr_status: "processing" }).eq("id", doc.id);

    const { parseFileCore } = await import("@/lib/ai/parse-document.functions");
    try {
      const result = await parseFileCore({
        fileBase64,
        mimeType: doc.mime_type || "application/octet-stream",
        filename: doc.original_filename || undefined,
        kind,
        supabase,
        userId,
      });
      if (!doc.ai_upload_id) {
        await supabase
          .from("documents")
          .update({
            ocr_status: "done",
            ocr_extracted: typeof result.parsed === "string" ? { raw: result.parsed } : result.parsed,
            ai_upload_id: result.uploadId ?? null,
          })
          .eq("id", doc.id);
      }

      // === Đối chiếu MST/tên tổ chức — chặn bypass qua parse lại ===
      try {
        const { getTenantIdentity, matchDocumentToTenant } = await import(
          "@/lib/ai/tenant-match.server"
        );
        const tenantIdentity = await getTenantIdentity(supabase, tenantId);
        const { data: freshDoc } = await supabase
          .from("documents").select("doc_kind").eq("id", doc.id).maybeSingle();
        const finalKind = freshDoc?.doc_kind ?? doc.doc_kind;
        const match = matchDocumentToTenant(
          typeof result.parsed === "object" ? result.parsed : {},
          finalKind,
          tenantIdentity,
        );
        if (match.status === "reject") {
          try { await supabase.storage.from(doc.storage_bucket).remove([doc.storage_path]); } catch {}
          await supabase.from("documents").update({
            ocr_status: "rejected",
            ocr_error: match.reason,
            notes: match.reason.slice(0, 1000),
          }).eq("id", doc.id);
          return { ok: false, rejected: true, reason: match.reason };
        }
        if (match.status === "warn") {
          await supabase.from("documents").update({
            notes: match.reason.slice(0, 1000),
          }).eq("id", doc.id);
        }
      } catch (mErr: any) {
        console.warn("[reparseDocument] tenant-match failed:", mErr?.message);
      }

      return { ok: true, parser: result.parser, pages: result.pages };
    } catch (e: any) {
      await supabase
        .from("documents")
        .update({ ocr_status: "failed", ocr_error: (e?.message || "Parse failed").slice(0, 500) })
        .eq("id", doc.id);
      throw new Error(e?.message || "Parse failed");
    }
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
  .middleware([withTenant])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { tenantId } = context;
    const { count } = await context.supabase
      .from("document_links")
      .select("document_id", { count: "exact", head: true })
      .eq("document_id", data.id);
    if ((count ?? 0) > 0) {
      throw new Error("Tài liệu đang được liên kết với chứng từ — gỡ liên kết trước khi xoá.");
    }
    const { data: doc } = await context.supabase
      .from("documents")
      .select("storage_bucket,storage_path,tenant_id")
      .eq("id", data.id)
      .maybeSingle();
    if (!doc || doc.tenant_id !== tenantId) throw new Error("Không tìm thấy tài liệu");
    const { error } = await context.supabase
      .from("documents")
      .delete()
      .eq("id", data.id)
      .eq("tenant_id", tenantId);
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
      .select("document_id, link_type, created_at, documents!inner(id, original_filename, doc_kind, mime_type, size_bytes, storage_bucket, storage_path, ocr_status, ocr_extracted, created_at)")
      .eq("entity_table", data.entity_table)
      .eq("entity_id", data.entity_id)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { rows: links ?? [] };
  });

export const listAttachableDocuments = createServerFn({ method: "GET" })
  .middleware([withTenant])
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
    const { tenantId } = context;
    const { data: existing } = await context.supabase
      .from("document_links")
      .select("document_id")
      .eq("entity_table", data.entity_table)
      .eq("entity_id", data.entity_id);
    const excluded = (existing ?? []).map((l: any) => l.document_id);

    let q = context.supabase
      .from("documents")
      .select("id, original_filename, doc_kind, mime_type, size_bytes, ocr_status, created_at")
      .eq("tenant_id", tenantId)
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
