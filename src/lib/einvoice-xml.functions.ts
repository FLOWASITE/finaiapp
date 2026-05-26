import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertTenantMember } from "@/lib/auth/active-tenant.server";
import {
  parseEinvoiceXml,
  EinvoiceParseError,
  type ParsedEinvoice,
} from "@/lib/einvoice-xml-parser";

const InputSchema = z.object({
  files: z
    .array(
      z.object({
        name: z.string().min(1).max(255),
        content: z.string().min(10).max(2_000_000),
      }),
    )
    .min(1)
    .max(50),
});

type FileResult = {
  name: string;
  status: "created" | "duplicate" | "error";
  direction?: "purchase" | "sale";
  invoiceId?: string;
  invoiceNo?: string;
  total?: number;
  warnings?: string[];
  error?: string;
};

const str = (v: unknown): string =>
  v === null || v === undefined ? "" : String(v).trim();

function buildRawOcr(parsed: ParsedEinvoice) {
  return {
    source: "einvoice_xml",
    version: parsed.version,
    template: parsed.template,
    series: parsed.series,
    invoice_no: parsed.invoice_no,
    issue_date: parsed.issue_date,
    payment_method: parsed.payment_method,
    fx_rate: parsed.fx_rate,
    currency: parsed.currency,
    cqt_code: parsed.cqt_code,
    has_cqt_code: parsed.has_cqt_code,
    cqt_signed: parsed.cqt_signed,
    seller_signed: parsed.seller_signed,
    sign_date_seller: parsed.sign_date_seller,
    sign_date_cqt: parsed.sign_date_cqt,
    adjustment_kind: parsed.adjustment_kind,
    related_invoice: parsed.related_invoice,
    seller: parsed.seller,
    buyer: parsed.buyer,
    totals: parsed.totals,
    raw_ttkhac: parsed.raw_ttkhac,
    warnings: parsed.warnings,
  };
}

export const importEinvoiceXml = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Resolve tenant + tax_id
    const { data: profile } = await supabase
      .from("profiles")
      .select("active_tenant_id, tax_id")
      .eq("id", userId)
      .maybeSingle();
    const tenantId = profile?.active_tenant_id ?? null;
    if (tenantId) await assertTenantMember(supabase, userId, tenantId);

    let tenantTaxId = str(profile?.tax_id).replace(/\D/g, "");
    if (tenantId) {
      const { data: t } = await supabase
        .from("tenants")
        .select("tax_id")
        .eq("id", tenantId)
        .maybeSingle();
      if (t?.tax_id) tenantTaxId = str(t.tax_id).replace(/\D/g, "");
    }

    if (!tenantTaxId) {
      return {
        results: data.files.map<FileResult>((f) => ({
          name: f.name,
          status: "error",
          error: "Chưa khai báo MST đơn vị (Cài đặt → Thông tin doanh nghiệp).",
        })),
      };
    }

    const results: FileResult[] = [];

    for (const file of data.files) {
      try {
        const parsed = parseEinvoiceXml(file.content);

        const sellerTax = parsed.seller.tax_id;
        const buyerTax = parsed.buyer.tax_id;

        let direction: "purchase" | "sale";
        if (sellerTax && sellerTax === tenantTaxId) direction = "sale";
        else if (buyerTax && buyerTax === tenantTaxId) direction = "purchase";
        else {
          throw new Error(
            `MST bên bán (${sellerTax || "?"}) và bên mua (${buyerTax || "?"}) đều không khớp MST đơn vị (${tenantTaxId}).`,
          );
        }

        const series = parsed.series; // mẫu + ký hiệu, vd "1C26TTT"
        const invoiceNo = parsed.invoice_no;
        const issueDate = parsed.issue_date;
        const subtotal = parsed.totals.subtotal;
        const vatAmount = parsed.totals.vat_amount;
        const total = parsed.totals.total;
        const currency = parsed.currency;
        const rawOcr = buildRawOcr(parsed);

        // Chỉ lưu dòng hàng/dv vào bảng line — bỏ qua khuyến mãi/ghi chú/CK
        // (giá trị đã nằm trong tổng TToan).
        const itemLines = parsed.lines.filter((l) => l.kind === "item");

        if (direction === "purchase") {
          // Dedup theo (invoice_no, sellerTax, series) — 1 NCC có thể có
          // cùng số HĐ giữa các ký hiệu/mẫu khác nhau.
          const { data: dup } = await supabase
            .from("invoices")
            .select("id")
            .eq("user_id", userId)
            .eq("invoice_no", invoiceNo)
            .eq("supplier_tax_id", sellerTax)
            .maybeSingle();
          if (dup) {
            results.push({
              name: file.name,
              status: "duplicate",
              direction,
              invoiceId: dup.id,
              invoiceNo,
              total,
              warnings: parsed.warnings,
            });
            continue;
          }

          // Upsert supplier
          let supplierId: string | null = null;
          if (sellerTax) {
            const { data: ex } = await supabase
              .from("suppliers")
              .select("id")
              .eq("user_id", userId)
              .eq("tax_id", sellerTax)
              .maybeSingle();
            if (ex) supplierId = ex.id;
            else {
              const { data: created } = await supabase
                .from("suppliers")
                .insert({
                  user_id: userId,
                  tenant_id: tenantId,
                  tax_id: sellerTax,
                  name: parsed.seller.name || "Chưa rõ",
                  address: parsed.seller.address || null,
                  phone: parsed.seller.phone || null,
                  email: parsed.seller.email || null,
                })
                .select("id")
                .single();
              supplierId = created?.id ?? null;
            }
          }

          // Save XML to storage
          const filePath = `${userId}/xml/${Date.now()}-${file.name.replace(/[^\w.\-]/g, "_")}`;
          await supabase.storage
            .from("invoices")
            .upload(
              filePath,
              new Blob([file.content], { type: "application/xml" }),
              { contentType: "application/xml", upsert: false },
            );

          const { data: inv, error: invErr } = await supabase
            .from("invoices")
            .insert({
              user_id: userId,
              tenant_id: tenantId,
              file_path: filePath,
              supplier_id: supplierId,
              supplier_name: parsed.seller.name || null,
              supplier_tax_id: sellerTax || null,
              invoice_no: invoiceNo,
              issue_date: issueDate,
              subtotal,
              vat_amount: vatAmount,
              total,
              currency,
              status: "uploaded",
              raw_ocr: rawOcr,
            })
            .select("id")
            .single();
          if (invErr || !inv)
            throw new Error(invErr?.message || "Không tạo được hoá đơn");

          if (itemLines.length) {
            await supabase.from("invoice_lines").insert(
              itemLines.map((l) => ({
                invoice_id: inv.id,
                description: l.description || "Hàng hoá / dịch vụ",
                qty: l.qty || 1,
                unit_price: l.unit_price,
                amount: l.amount,
                vat_rate: l.vat_rate ?? 0,
                line_type: "goods",
              })),
            );
          }

          results.push({
            name: file.name,
            status: "created",
            direction,
            invoiceId: inv.id,
            invoiceNo,
            total,
            warnings: parsed.warnings,
          });
        } else {
          // SALE
          const { data: dup } = await supabase
            .from("sales_invoices")
            .select("id")
            .eq("user_id", userId)
            .eq("invoice_no", invoiceNo)
            .eq("invoice_series", series || "")
            .maybeSingle();
          if (dup) {
            results.push({
              name: file.name,
              status: "duplicate",
              direction,
              invoiceId: dup.id,
              invoiceNo,
              total,
              warnings: parsed.warnings,
            });
            continue;
          }

          let customerId: string | null = null;
          if (buyerTax) {
            const { data: ex } = await supabase
              .from("customers")
              .select("id")
              .eq("user_id", userId)
              .eq("tax_id", buyerTax)
              .maybeSingle();
            if (ex) customerId = ex.id;
            else {
              const { data: created } = await supabase
                .from("customers")
                .insert({
                  user_id: userId,
                  tenant_id: tenantId,
                  tax_id: buyerTax,
                  name: parsed.buyer.name || "Chưa rõ",
                  address: parsed.buyer.address || null,
                  email: parsed.buyer.email || null,
                  phone: parsed.buyer.phone || null,
                })
                .select("id")
                .single();
              customerId = created?.id ?? null;
            }
          }

          const { data: sinv, error: sErr } = await supabase
            .from("sales_invoices")
            .insert({
              user_id: userId,
              tenant_id: tenantId,
              customer_id: customerId,
              customer_name: parsed.buyer.name || null,
              customer_tax_id: buyerTax || null,
              customer_email: parsed.buyer.email || null,
              billing_address: parsed.buyer.address || null,
              invoice_series: series || "1C26TAA",
              invoice_no: invoiceNo,
              issue_date: issueDate || new Date().toISOString().slice(0, 10),
              subtotal,
              vat_amount: vatAmount,
              total,
              currency,
              status: "issued",
              einvoice_code: parsed.cqt_code || null,
            })
            .select("id")
            .single();
          if (sErr || !sinv)
            throw new Error(sErr?.message || "Không tạo được hoá đơn bán");

          if (itemLines.length) {
            await supabase.from("sales_invoice_lines").insert(
              itemLines.map((l) => ({
                invoice_id: sinv.id,
                description: l.description || "Hàng hoá / dịch vụ",
                qty: l.qty || 1,
                unit_price: l.unit_price,
                amount: l.amount,
                vat_rate: l.vat_rate ?? 0,
                vat_code: l.vat_code,
                pre_vat_amount: l.amount,
                line_vat_amount: l.vat_amount,
              })),
            );
          }

          results.push({
            name: file.name,
            status: "created",
            direction,
            invoiceId: sinv.id,
            invoiceNo,
            total,
            warnings: parsed.warnings,
          });
        }
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
