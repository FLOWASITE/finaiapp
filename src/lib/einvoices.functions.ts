import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  parseEinvoiceXml,
  EinvoiceParseError,
} from "@/lib/einvoice-xml-parser";


// ------- helpers -------
const str = (v: unknown): string =>
  v === null || v === undefined ? "" : String(v).trim();

async function resolveTenant(supabase: any, userId: string) {
  const { data: profile } = await supabase
    .from("profiles")
    .select("active_tenant_id, tax_id")
    .eq("id", userId)
    .maybeSingle();
  const tenantId: string | null = profile?.active_tenant_id ?? null;
  let tenantTaxId = str(profile?.tax_id).replace(/\D/g, "");
  if (tenantId) {
    const { data: t } = await supabase
      .from("tenants")
      .select("tax_id")
      .eq("id", tenantId)
      .maybeSingle();
    if (t?.tax_id) tenantTaxId = str(t.tax_id).replace(/\D/g, "");
  }
  return { tenantId, tenantTaxId };
}

// ============ LIST ============
export const listEInvoices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        direction: z.enum(["in", "out"]),
        q: z.string().max(120).optional().default(""),
        dateFrom: z.string().optional().nullable(),
        dateTo: z.string().optional().nullable(),
        status: z.string().optional().nullable(),
        xmlStatus: z.string().optional().nullable(),
        matched: z.enum(["all", "matched", "unmatched"]).optional().default("all"),
        page: z.number().int().min(1).max(1000).optional().default(1),
        pageSize: z.number().int().min(1).max(200).optional().default(50),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const from = (data.page - 1) * data.pageSize;
    const to = from + data.pageSize - 1;

    let q = supabase
      .from("einvoices")
      .select(
        "id, direction, source, seller_tax_id, seller_name, buyer_tax_id, buyer_name, invoice_series, invoice_no, issue_date, total, vat_amount, subtotal, tct_status, tct_lookup_code, matched_sales_invoice_id, matched_purchase_invoice_id, xml_fetch_status, xml_fetch_error, created_at",
        { count: "exact" },
      )
      .eq("direction", data.direction)
      .order("issue_date", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .range(from, to);

    if (data.dateFrom) q = q.gte("issue_date", data.dateFrom);
    if (data.dateTo) q = q.lte("issue_date", data.dateTo);
    if (data.status) q = q.eq("tct_status", data.status);
    if (data.xmlStatus) q = q.eq("xml_fetch_status", data.xmlStatus);
    if (data.matched === "matched") {
      q =
        data.direction === "in"
          ? q.not("matched_purchase_invoice_id", "is", null)
          : q.not("matched_sales_invoice_id", "is", null);
    } else if (data.matched === "unmatched") {
      q =
        data.direction === "in"
          ? q.is("matched_purchase_invoice_id", null)
          : q.is("matched_sales_invoice_id", null);
    }
    const term = data.q.trim();
    if (term) {
      const like = `%${term}%`;
      q = q.or(
        `invoice_no.ilike.${like},tct_lookup_code.ilike.${like},seller_tax_id.ilike.${like},buyer_tax_id.ilike.${like},seller_name.ilike.${like},buyer_name.ilike.${like}`,
      );
    }

    const { data: rows, error, count } = await q;
    if (error) throw new Error(error.message);
    return { rows: rows ?? [], total: count ?? 0 };
  });

// ============ GET DETAIL ============
export const getEInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: e, error } = await supabase
      .from("einvoices")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!e) throw new Error("Không tìm thấy hoá đơn điện tử");

    const { data: lines } = await supabase
      .from("einvoice_lines")
      .select("*")
      .eq("einvoice_id", data.id)
      .order("line_no", { ascending: true });

    let xmlUrl: string | null = null;
    if (e.xml_path) {
      const { data: signed } = await supabase.storage
        .from("einvoices")
        .createSignedUrl(e.xml_path, 600);
      xmlUrl = signed?.signedUrl ?? null;
    }

    // Preview của HĐ đã liên kết (nếu có)
    let matched: {
      id: string;
      invoice_no: string | null;
      issue_date: string | null;
      total: number | null;
      party_name: string | null;
    } | null = null;
    if (e.direction === "in" && e.matched_purchase_invoice_id) {
      const { data: m } = await supabase
        .from("invoices")
        .select("id, invoice_no, issue_date, total, supplier_name")
        .eq("id", e.matched_purchase_invoice_id)
        .maybeSingle();
      if (m)
        matched = {
          id: m.id,
          invoice_no: m.invoice_no,
          issue_date: m.issue_date,
          total: m.total,
          party_name: m.supplier_name,
        };
    } else if (e.direction === "out" && e.matched_sales_invoice_id) {
      const { data: m } = await supabase
        .from("sales_invoices")
        .select("id, invoice_no, issue_date, total, customer_name")
        .eq("id", e.matched_sales_invoice_id)
        .maybeSingle();
      if (m)
        matched = {
          id: m.id,
          invoice_no: m.invoice_no,
          issue_date: m.issue_date,
          total: m.total,
          party_name: m.customer_name,
        };
    }

    return { einvoice: e, lines: lines ?? [], xmlUrl, matched };
  });

// ============ SEARCH LINKABLE INVOICES ============
export const searchLinkableInvoices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        einvoiceId: z.string().uuid(),
        q: z.string().max(120).optional().default(""),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: e } = await supabase
      .from("einvoices")
      .select("id, tenant_id, direction, seller_tax_id, buyer_tax_id, invoice_no, total")
      .eq("id", data.einvoiceId)
      .maybeSingle();
    if (!e) throw new Error("Không tìm thấy HĐĐT");

    const term = data.q.trim();
    const counterpartTax = e.direction === "in" ? e.seller_tax_id : e.buyer_tax_id;

    if (e.direction === "in") {
      let q = supabase
        .from("invoices")
        .select("id, invoice_no, issue_date, total, supplier_name, supplier_tax_id")
        .eq("tenant_id", e.tenant_id)
        .order("issue_date", { ascending: false, nullsFirst: false })
        .limit(30);
      if (counterpartTax) q = q.eq("supplier_tax_id", counterpartTax);
      if (term) {
        const like = `%${term}%`;
        q = q.or(`invoice_no.ilike.${like},supplier_name.ilike.${like}`);
      } else if (e.invoice_no) {
        q = q.ilike("invoice_no", `%${e.invoice_no}%`);
      }
      const { data: rows } = await q;
      return {
        rows: (rows ?? []).map((r: any) => ({
          id: r.id,
          invoice_no: r.invoice_no,
          issue_date: r.issue_date,
          total: r.total,
          party_name: r.supplier_name,
          party_tax_id: r.supplier_tax_id,
          exact_no: r.invoice_no === e.invoice_no,
        })),
        einvoiceTotal: e.total,
      };
    } else {
      let q = supabase
        .from("sales_invoices")
        .select("id, invoice_no, issue_date, total, customer_name, customer_tax_id")
        .eq("tenant_id", e.tenant_id)
        .order("issue_date", { ascending: false, nullsFirst: false })
        .limit(30);
      if (counterpartTax) q = q.eq("customer_tax_id", counterpartTax);
      if (term) {
        const like = `%${term}%`;
        q = q.or(`invoice_no.ilike.${like},customer_name.ilike.${like}`);
      } else if (e.invoice_no) {
        q = q.ilike("invoice_no", `%${e.invoice_no}%`);
      }
      const { data: rows } = await q;
      return {
        rows: (rows ?? []).map((r: any) => ({
          id: r.id,
          invoice_no: r.invoice_no,
          issue_date: r.issue_date,
          total: r.total,
          party_name: r.customer_name,
          party_tax_id: r.customer_tax_id,
          exact_no: r.invoice_no === e.invoice_no,
        })),
        einvoiceTotal: e.total,
      };
    }
  });

// ============ REVERSE LOOKUP: linked einvoice for a given invoice ============
export const getLinkedEInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        kind: z.enum(["in", "out"]),
        invoiceId: z.string().uuid(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const col =
      data.kind === "in" ? "matched_purchase_invoice_id" : "matched_sales_invoice_id";
    const { data: rows } = await supabase
      .from("einvoices")
      .select(
        "id, invoice_series, invoice_no, issue_date, total, tct_lookup_code, tct_status, direction",
      )
      .eq(col, data.invoiceId)
      .limit(1);
    return { einvoice: rows?.[0] ?? null };
  });

// ============ AUTO-MATCH ============
export const autoMatchEInvoices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        direction: z.enum(["in", "out"]),
        dateFrom: z.string().optional().nullable(),
        dateTo: z.string().optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { tenantId } = await resolveTenant(supabase, userId);
    if (!tenantId) throw new Error("Chưa chọn tổ chức");

    const matchedCol =
      data.direction === "in"
        ? "matched_purchase_invoice_id"
        : "matched_sales_invoice_id";

    let q = supabase
      .from("einvoices")
      .select("id, invoice_no, seller_tax_id, buyer_tax_id, total")
      .eq("tenant_id", tenantId)
      .eq("direction", data.direction)
      .is(matchedCol, null)
      .not("invoice_no", "is", null);
    if (data.dateFrom) q = q.gte("issue_date", data.dateFrom);
    if (data.dateTo) q = q.lte("issue_date", data.dateTo);

    const { data: candidates, error } = await q.limit(500);
    if (error) throw new Error(error.message);

    let matched = 0;
    let ambiguous = 0;
    let skipped = 0;

    for (const e of candidates ?? []) {
      if (!e.invoice_no) {
        skipped++;
        continue;
      }
      const partyTax =
        data.direction === "in" ? e.seller_tax_id : e.buyer_tax_id;
      if (!partyTax) {
        skipped++;
        continue;
      }

      if (data.direction === "in") {
        const { data: hits } = await supabase
          .from("invoices")
          .select("id")
          .eq("tenant_id", tenantId)
          .eq("invoice_no", e.invoice_no)
          .eq("supplier_tax_id", partyTax)
          .limit(2);
        if (!hits || hits.length === 0) {
          skipped++;
          continue;
        }
        if (hits.length > 1) {
          ambiguous++;
          continue;
        }
        await supabase
          .from("einvoices")
          .update({ matched_purchase_invoice_id: hits[0].id })
          .eq("id", e.id);
        matched++;
      } else {
        const { data: hits } = await supabase
          .from("sales_invoices")
          .select("id")
          .eq("tenant_id", tenantId)
          .eq("invoice_no", e.invoice_no)
          .eq("customer_tax_id", partyTax)
          .limit(2);
        if (!hits || hits.length === 0) {
          skipped++;
          continue;
        }
        if (hits.length > 1) {
          ambiguous++;
          continue;
        }
        await supabase
          .from("einvoices")
          .update({ matched_sales_invoice_id: hits[0].id })
          .eq("id", e.id);
        matched++;
      }
    }

    return {
      scanned: candidates?.length ?? 0,
      matched,
      ambiguous,
      skipped,
    };
  });

// ============ IMPORT XML INTO STORE ============
export const importEinvoicesToStore = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        files: z
          .array(
            z.object({
              name: z.string().min(1).max(255),
              content: z.string().min(10).max(2_000_000),
            }),
          )
          .min(1)
          .max(50),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { tenantId, tenantTaxId } = await resolveTenant(supabase, userId);

    if (!tenantId) {
      return {
        results: data.files.map((f) => ({
          name: f.name,
          status: "error" as const,
          error: "Chưa chọn tổ chức (tenant).",
        })),
      };
    }
    if (!tenantTaxId) {
      return {
        results: data.files.map((f) => ({
          name: f.name,
          status: "error" as const,
          error: "Chưa khai báo MST đơn vị (Cài đặt → Thông tin doanh nghiệp).",
        })),
      };
    }

    type Row = {
      name: string;
      status: "created" | "duplicate" | "error";
      einvoiceId?: string;
      direction?: "in" | "out";
      invoiceNo?: string;
      total?: number;
      warnings?: string[];
      error?: string;
    };
    const results: Row[] = [];

    for (const file of data.files) {
      try {
        const parsed = parseEinvoiceXml(file.content);

        const sellerTax = parsed.seller.tax_id;
        const buyerTax = parsed.buyer.tax_id;

        let direction: "in" | "out";
        if (sellerTax && sellerTax === tenantTaxId) direction = "out";
        else if (buyerTax && buyerTax === tenantTaxId) direction = "in";
        else
          throw new Error(
            `MST bên bán (${sellerTax || "?"}) và bên mua (${buyerTax || "?"}) đều không khớp MST đơn vị (${tenantTaxId}).`,
          );

        const series = parsed.series;
        const invoiceNo = parsed.invoice_no;
        const issueDate = parsed.issue_date;
        const subtotal = parsed.totals.subtotal;
        const vatAmount = parsed.totals.vat_amount;
        const total = parsed.totals.total;
        const currency = parsed.currency;
        const mccqt = parsed.cqt_code;

        // dedup
        const { data: dup } = await supabase
          .from("einvoices")
          .select("id")
          .eq("tenant_id", tenantId)
          .eq("direction", direction)
          .eq("seller_tax_id", sellerTax || "")
          .eq("invoice_series", series || "")
          .eq("invoice_no", invoiceNo)
          .maybeSingle();
        if (dup) {
          results.push({
            name: file.name,
            status: "duplicate",
            direction,
            einvoiceId: dup.id,
            invoiceNo,
            total,
            warnings: parsed.warnings,
          });
          continue;
        }

        // upload XML
        const filePath = `${tenantId}/xml/${Date.now()}-${file.name.replace(/[^\w.\-]/g, "_")}`;
        await supabase.storage
          .from("einvoices")
          .upload(filePath, new Blob([file.content], { type: "application/xml" }), {
            contentType: "application/xml",
            upsert: false,
          });

        const { data: e, error: insErr } = await supabase
          .from("einvoices")
          .insert({
            tenant_id: tenantId,
            user_id: userId,
            direction,
            source: "xml_upload",
            seller_tax_id: sellerTax || null,
            seller_name: parsed.seller.name || null,
            seller_address: parsed.seller.address || null,
            buyer_tax_id: buyerTax || null,
            buyer_name: parsed.buyer.name || null,
            buyer_address: parsed.buyer.address || null,
            invoice_template: parsed.template || null,
            invoice_series: series || null,
            invoice_no: invoiceNo,
            issue_date: issueDate,
            currency,
            exchange_rate: parsed.fx_rate || 1,
            subtotal,
            vat_amount: vatAmount,
            total,
            tct_lookup_code: mccqt,
            tct_status: mccqt ? "valid" : "unknown",
            tct_mcct: mccqt || null,
            tct_signed_at: parsed.sign_date_cqt || null,
            xml_path: filePath,
            tct_raw: {
              source: "xml_upload",
              payment_method: parsed.payment_method,
              adjustment_kind: parsed.adjustment_kind,
              related_invoice: parsed.related_invoice,
              seller_signed: parsed.seller_signed,
              cqt_signed: parsed.cqt_signed,
              sign_date_seller: parsed.sign_date_seller,
              by_rate: parsed.totals.by_rate,
              total_in_words: parsed.totals.total_in_words,
              raw_ttkhac: parsed.raw_ttkhac,
              warnings: parsed.warnings,
            },
          })
          .select("id")
          .single();
        if (insErr || !e) throw new Error(insErr?.message || "Không tạo được hoá đơn");

        const lines = parsed.lines.map((l, idx) => ({
          einvoice_id: e.id,
          line_no: l.seq || idx + 1,
          description: l.description || "Hàng hoá / dịch vụ",
          unit: l.unit || null,
          qty: l.qty || 1,
          unit_price: l.unit_price,
          amount: l.amount,
          vat_rate: l.vat_rate ?? 0,
          vat_amount: l.vat_amount,
        }));
        if (lines.length) await supabase.from("einvoice_lines").insert(lines);

        results.push({
          name: file.name,
          status: "created",
          direction,
          einvoiceId: e.id,
          invoiceNo,
          total,
          warnings: parsed.warnings,
        });
      } catch (e: any) {
        const msg =
          e instanceof EinvoiceParseError
            ? `${e.message}${e.warnings.length ? ` (${e.warnings.join("; ")})` : ""}`
            : e?.message || String(e);
        results.push({ name: file.name, status: "error", error: msg });
      }
    }


    return { results };
  });

// ============ LINK TO EXISTING INVOICE ============
export const linkEInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        einvoiceId: z.string().uuid(),
        targetId: z.string().uuid().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: e, error } = await supabase
      .from("einvoices")
      .select("id, direction, tenant_id")
      .eq("id", data.einvoiceId)
      .maybeSingle();
    if (error || !e) throw new Error("Không tìm thấy HĐĐT");

    // validate target belongs to same tenant + correct table
    if (data.targetId) {
      const table = e.direction === "in" ? "invoices" : "sales_invoices";
      const { data: t } = await supabase
        .from(table)
        .select("id, tenant_id")
        .eq("id", data.targetId)
        .maybeSingle();
      if (!t) throw new Error("Không tìm thấy hoá đơn nội bộ để liên kết");
      if (t.tenant_id !== e.tenant_id)
        throw new Error("Hoá đơn không thuộc cùng tổ chức");
    }

    const patch =
      e.direction === "in"
        ? { matched_purchase_invoice_id: data.targetId }
        : { matched_sales_invoice_id: data.targetId };
    const { error: upErr } = await supabase
      .from("einvoices")
      .update(patch)
      .eq("id", data.einvoiceId);
    if (upErr) throw new Error(upErr.message);
    return { ok: true };
  });

// ============ CREATE PURCHASE INVOICE FROM EINVOICE ============
export const createPurchaseFromEInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ einvoiceId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: e, error } = await supabase
      .from("einvoices")
      .select("*")
      .eq("id", data.einvoiceId)
      .maybeSingle();
    if (error || !e) throw new Error("Không tìm thấy HĐĐT");
    if (e.direction !== "in")
      throw new Error("Chỉ hỗ trợ tạo phiếu mua từ HĐĐT đầu vào");
    if (e.matched_purchase_invoice_id)
      throw new Error("HĐĐT này đã được liên kết với phiếu mua khác");

    // Upsert supplier
    let supplierId: string | null = null;
    if (e.seller_tax_id) {
      const { data: ex } = await supabase
        .from("suppliers")
        .select("id")
        .eq("tenant_id", e.tenant_id)
        .eq("tax_id", e.seller_tax_id)
        .maybeSingle();
      if (ex) supplierId = ex.id;
      else {
        const { data: created } = await supabase
          .from("suppliers")
          .insert({
            user_id: userId,
            tenant_id: e.tenant_id,
            tax_id: e.seller_tax_id,
            name: e.seller_name || "Chưa rõ",
            address: e.seller_address || null,
          })
          .select("id")
          .single();
        supplierId = created?.id ?? null;
      }
    }

    const { data: inv, error: invErr } = await supabase
      .from("invoices")
      .insert({
        user_id: userId,
        tenant_id: e.tenant_id,
        supplier_id: supplierId,
        supplier_name: e.seller_name,
        supplier_tax_id: e.seller_tax_id,
        invoice_no: e.invoice_no,
        issue_date: e.issue_date,
        subtotal: e.subtotal,
        vat_amount: e.vat_amount,
        total: e.total,
        currency: e.currency,
        status: "extracted",
        file_path: e.xml_path ?? "",
        raw_ocr: {
          source: "einvoice",
          series: e.invoice_series,
          cqt_code: e.tct_mcct,
          einvoice_id: e.id,
        },
      })
      .select("id")
      .single();
    if (invErr || !inv) throw new Error(invErr?.message || "Tạo hoá đơn mua thất bại");

    // copy lines
    const { data: lines } = await supabase
      .from("einvoice_lines")
      .select("*")
      .eq("einvoice_id", e.id);
    if (lines && lines.length) {
      await supabase.from("invoice_lines").insert(
        lines.map((l: any) => ({
          invoice_id: inv.id,
          description: l.description,
          qty: l.qty,
          unit_price: l.unit_price,
          amount: l.amount,
          vat_rate: l.vat_rate,
        })),
      );
    }

    await supabase
      .from("einvoices")
      .update({ matched_purchase_invoice_id: inv.id })
      .eq("id", e.id);

    return { invoiceId: inv.id };
  });

// ============ DELETE ============
export const deleteEInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: e } = await supabase
      .from("einvoices")
      .select("xml_path")
      .eq("id", data.id)
      .maybeSingle();
    if (e?.xml_path) {
      await supabase.storage.from("einvoices").remove([e.xml_path]);
    }
    const { error } = await supabase.from("einvoices").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============ INBOX: SUGGESTED MATCHES ============
// Lấy các HĐĐT chưa liên kết, gợi ý hoá đơn nội bộ ứng viên dựa trên
// MST đối tác + ngày phát hành ±3 ngày + tổng tiền ±1%.
export const listEInvoiceSuggestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        direction: z.enum(["in", "out"]),
        limit: z.number().int().min(1).max(100).optional().default(50),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { tenantId } = await resolveTenant(supabase, userId);
    if (!tenantId) throw new Error("Chưa chọn tổ chức");

    const matchedCol =
      data.direction === "in"
        ? "matched_purchase_invoice_id"
        : "matched_sales_invoice_id";

    const { data: einvoices, error } = await supabase
      .from("einvoices")
      .select(
        "id, direction, seller_tax_id, seller_name, buyer_tax_id, buyer_name, invoice_series, invoice_no, issue_date, total, vat_amount, tct_status, tct_lookup_code",
      )
      .eq("tenant_id", tenantId)
      .eq("direction", data.direction)
      .eq("suggestion_dismissed", false)
      .is(matchedCol, null)
      .not("issue_date", "is", null)
      .not("total", "is", null)
      .order("issue_date", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);

    const targetTable = data.direction === "in" ? "invoices" : "sales_invoices";
    const partyCol =
      data.direction === "in" ? "supplier_tax_id" : "customer_tax_id";

    const suggestions: Array<{
      einvoice: any;
      candidates: Array<{
        id: string;
        invoice_no: string | null;
        issue_date: string | null;
        total: number | null;
        score: number;
        reasons: string[];
      }>;
    }> = [];

    for (const e of einvoices ?? []) {
      const partyTax =
        data.direction === "in" ? e.seller_tax_id : e.buyer_tax_id;
      if (!partyTax || !e.issue_date || e.total == null) continue;

      const d = new Date(e.issue_date);
      const from = new Date(d);
      from.setDate(d.getDate() - 3);
      const to = new Date(d);
      to.setDate(d.getDate() + 3);
      const tol = Math.max(1000, Math.abs(Number(e.total)) * 0.01);
      const lo = Number(e.total) - tol;
      const hi = Number(e.total) + tol;

      const { data: cands } = await supabase
        .from(targetTable)
        .select("id, invoice_no, issue_date, total")
        .eq("tenant_id", tenantId)
        .eq(partyCol, partyTax)
        .gte("issue_date", from.toISOString().slice(0, 10))
        .lte("issue_date", to.toISOString().slice(0, 10))
        .gte("total", lo)
        .lte("total", hi)
        .limit(5);

      if (!cands || cands.length === 0) continue;

      const scored = cands.map((c: any) => {
        const reasons: string[] = [];
        let score = 50;
        reasons.push(`Cùng MST ${partyTax}`);
        const dayDiff = Math.abs(
          (new Date(c.issue_date).getTime() - d.getTime()) /
            (1000 * 60 * 60 * 24),
        );
        if (dayDiff < 0.5) {
          score += 25;
          reasons.push("Cùng ngày phát hành");
        } else {
          reasons.push(`Lệch ${Math.round(dayDiff)} ngày`);
          score += Math.max(0, 20 - Math.round(dayDiff) * 5);
        }
        const diff = Math.abs(Number(c.total) - Number(e.total));
        const pct = Number(e.total) ? diff / Math.abs(Number(e.total)) : 0;
        if (diff < 1) {
          score += 25;
          reasons.push("Tổng tiền trùng khớp");
        } else {
          reasons.push(`Lệch ${(pct * 100).toFixed(2)}% tổng tiền`);
          score += Math.max(0, 20 - Math.round(pct * 1000));
        }
        if (c.invoice_no && e.invoice_no && c.invoice_no === e.invoice_no) {
          score += 15;
          reasons.push("Trùng số HĐ");
        }
        return { ...c, score, reasons };
      });

      scored.sort((a, b) => b.score - a.score);
      suggestions.push({ einvoice: e, candidates: scored });
    }

    return { suggestions };
  });

// ============ DISMISS SUGGESTION ============
export const dismissEInvoiceSuggestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ einvoiceId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("einvoices")
      .update({ suggestion_dismissed: true })
      .eq("id", data.einvoiceId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
