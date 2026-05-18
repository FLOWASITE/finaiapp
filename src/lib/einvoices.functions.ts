import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { XMLParser } from "fast-xml-parser";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ------- helpers -------
const num = (v: unknown): number => {
  if (v === null || v === undefined || v === "") return 0;
  const n = Number(String(v).replace(/[,\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
};
const str = (v: unknown): string =>
  v === null || v === undefined ? "" : String(v).trim();
const parsePct = (v: unknown): number => {
  const s = str(v);
  if (!s) return 0;
  const m = s.match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : 0;
};
const asArray = <T,>(v: T | T[] | undefined | null): T[] =>
  v === null || v === undefined ? [] : Array.isArray(v) ? v : [v];

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
        "id, direction, source, seller_tax_id, seller_name, buyer_tax_id, buyer_name, invoice_series, invoice_no, issue_date, total, vat_amount, subtotal, tct_status, tct_lookup_code, matched_sales_invoice_id, matched_purchase_invoice_id, created_at",
        { count: "exact" },
      )
      .eq("direction", data.direction)
      .order("issue_date", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .range(from, to);

    if (data.dateFrom) q = q.gte("issue_date", data.dateFrom);
    if (data.dateTo) q = q.lte("issue_date", data.dateTo);
    if (data.status) q = q.eq("tct_status", data.status);
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

    return { einvoice: e, lines: lines ?? [], xmlUrl };
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

    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@_",
      trimValues: true,
      parseTagValue: false,
    });

    type Row = {
      name: string;
      status: "created" | "duplicate" | "error";
      einvoiceId?: string;
      direction?: "in" | "out";
      invoiceNo?: string;
      total?: number;
      error?: string;
    };
    const results: Row[] = [];

    for (const file of data.files) {
      try {
        const xml = parser.parse(file.content);
        const dl =
          xml?.HDon?.DLHDon ??
          (Array.isArray(xml?.HDon) ? xml.HDon[0]?.DLHDon : undefined);
        if (!dl) throw new Error("Không nhận diện được cấu trúc HDon/DLHDon");

        const tt = dl.TTChung ?? {};
        const nd = dl.NDHDon ?? {};
        const nban = nd.NBan ?? {};
        const nmua = nd.NMua ?? {};
        const toan = nd.TToan ?? {};
        const mccqt = str(xml?.HDon?.MCCQT?.["#text"] ?? xml?.HDon?.MCCQT);
        const lookupCode = str(xml?.HDon?.MCCQT ?? "") || null;

        const sellerTax = str(nban.MST).replace(/\D/g, "");
        const buyerTax = str(nmua.MST).replace(/\D/g, "");

        let direction: "in" | "out";
        if (sellerTax && sellerTax === tenantTaxId) direction = "out";
        else if (buyerTax && buyerTax === tenantTaxId) direction = "in";
        else
          throw new Error(
            `MST bên bán (${sellerTax || "?"}) và bên mua (${buyerTax || "?"}) đều không khớp MST đơn vị (${tenantTaxId}).`,
          );

        const invoiceSeries = str(tt.KHHDon);
        const invoiceNo = str(tt.SHDon);
        const issueDate = str(tt.NLap) || null;
        const subtotal = num(toan.TgTCThue);
        const vatAmount = num(toan.TgTThue);
        const total = num(toan.TgTTTBSo);
        const currency = str(tt.DVTTe) || "VND";

        // dedup
        const { data: dup } = await supabase
          .from("einvoices")
          .select("id")
          .eq("tenant_id", tenantId)
          .eq("direction", direction)
          .eq("seller_tax_id", sellerTax || "")
          .eq("invoice_series", invoiceSeries || "")
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
            seller_name: str(nban.Ten) || null,
            seller_address: str(nban.DChi) || null,
            buyer_tax_id: buyerTax || null,
            buyer_name: str(nmua.Ten) || null,
            buyer_address: str(nmua.DChi) || null,
            invoice_series: invoiceSeries || null,
            invoice_no: invoiceNo,
            issue_date: issueDate,
            currency,
            subtotal,
            vat_amount: vatAmount,
            total,
            tct_lookup_code: lookupCode,
            tct_status: mccqt ? "valid" : "unknown",
            tct_mcct: mccqt || null,
            xml_path: filePath,
            tct_raw: { source: "xml_upload" },
          })
          .select("id")
          .single();
        if (insErr || !e) throw new Error(insErr?.message || "Không tạo được hoá đơn");

        const lines = asArray<any>(nd?.DSHHDVu?.HHDVu).map((h, idx) => ({
          einvoice_id: e.id,
          line_no: idx + 1,
          description: str(h.THHDVu) || "Hàng hoá / dịch vụ",
          unit: str(h.DVTinh) || null,
          qty: num(h.SLuong) || 1,
          unit_price: num(h.DGia),
          amount: num(h.ThTien),
          vat_rate: parsePct(h.TSuat),
          vat_amount: num(h.TThue),
        }));
        if (lines.length)
          await supabase.from("einvoice_lines").insert(lines);

        results.push({
          name: file.name,
          status: "created",
          direction,
          einvoiceId: e.id,
          invoiceNo,
          total,
        });
      } catch (e: any) {
        results.push({
          name: file.name,
          status: "error",
          error: e?.message || String(e),
        });
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
      .select("id, direction")
      .eq("id", data.einvoiceId)
      .maybeSingle();
    if (error || !e) throw new Error("Không tìm thấy HĐĐT");

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
