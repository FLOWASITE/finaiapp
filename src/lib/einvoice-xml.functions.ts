import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { XMLParser } from "fast-xml-parser";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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
  error?: string;
};

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

    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@_",
      trimValues: true,
      parseTagValue: false,
    });

    const results: FileResult[] = [];

    for (const file of data.files) {
      try {
        const xml = parser.parse(file.content);
        const dl =
          xml?.HDon?.DLHDon ??
          xml?.HDon?.DLHDon?.[0] ??
          (Array.isArray(xml?.HDon) ? xml.HDon[0]?.DLHDon : undefined);
        if (!dl) throw new Error("Không nhận diện được cấu trúc HDon/DLHDon");

        const tt = dl.TTChung ?? {};
        const nd = dl.NDHDon ?? {};
        const nban = nd.NBan ?? {};
        const nmua = nd.NMua ?? {};
        const toan = nd.TToan ?? {};
        const mccqt = str(xml?.HDon?.MCCQT?.["#text"] ?? xml?.HDon?.MCCQT);

        const sellerTax = str(nban.MST).replace(/\D/g, "");
        const buyerTax = str(nmua.MST).replace(/\D/g, "");

        let direction: "purchase" | "sale";
        if (sellerTax && sellerTax === tenantTaxId) direction = "sale";
        else if (buyerTax && buyerTax === tenantTaxId) direction = "purchase";
        else {
          throw new Error(
            `MST bên bán (${sellerTax || "?"}) và bên mua (${buyerTax || "?"}) đều không khớp MST đơn vị (${tenantTaxId}).`,
          );
        }

        const invoiceSeries = str(tt.KHHDon);
        const invoiceNo = str(tt.SHDon);
        const issueDate = str(tt.NLap) || null;
        const subtotal = num(toan.TgTCThue);
        const vatAmount = num(toan.TgTThue);
        const total = num(toan.TgTTTBSo);
        const currency = str(tt.DVTTe) || "VND";

        const lines = asArray<any>(nd?.DSHHDVu?.HHDVu).map((h) => ({
          description: str(h.THHDVu),
          unit: str(h.DVTinh),
          qty: num(h.SLuong) || 1,
          unit_price: num(h.DGia),
          amount: num(h.ThTien),
          vat_rate: parsePct(h.TSuat),
          vat_amount: num(h.TThue),
        }));

        if (direction === "purchase") {
          // Dedup
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
                  name: str(nban.Ten) || "Chưa rõ",
                  address: str(nban.DChi) || null,
                  phone: str(nban.SDThoai) || null,
                  email: str(nban.DCTDTu) || null,
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
            .upload(filePath, new Blob([file.content], { type: "application/xml" }), {
              contentType: "application/xml",
              upsert: false,
            });

          const { data: inv, error: invErr } = await supabase
            .from("invoices")
            .insert({
              user_id: userId,
              tenant_id: tenantId,
              file_path: filePath,
              supplier_id: supplierId,
              supplier_name: str(nban.Ten) || null,
              supplier_tax_id: sellerTax || null,
              invoice_no: invoiceNo,
              issue_date: issueDate,
              subtotal,
              vat_amount: vatAmount,
              total,
              currency,
              status: "extracted",
              raw_ocr: {
                source: "einvoice_xml",
                series: invoiceSeries,
                cqt_code: mccqt,
              },
            })
            .select("id")
            .single();
          if (invErr || !inv) throw new Error(invErr?.message || "Không tạo được hoá đơn");

          if (lines.length) {
            await supabase.from("invoice_lines").insert(
              lines.map((l) => ({
                invoice_id: inv.id,
                description: l.description,
                qty: l.qty,
                unit_price: l.unit_price,
                amount: l.amount,
                vat_rate: l.vat_rate,
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
          });
        } else {
          // SALE
          const { data: dup } = await supabase
            .from("sales_invoices")
            .select("id")
            .eq("user_id", userId)
            .eq("invoice_no", invoiceNo)
            .eq("invoice_series", invoiceSeries || "")
            .maybeSingle();
          if (dup) {
            results.push({
              name: file.name,
              status: "duplicate",
              direction,
              invoiceId: dup.id,
              invoiceNo,
              total,
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
                  name: str(nmua.Ten) || "Chưa rõ",
                  address: str(nmua.DChi) || null,
                  email: str(nmua.DCTDTu) || null,
                  phone: str(nmua.SDThoai) || null,
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
              customer_name: str(nmua.Ten) || null,
              customer_tax_id: buyerTax || null,
              customer_email: str(nmua.DCTDTu) || null,
              billing_address: str(nmua.DChi) || null,
              invoice_series: invoiceSeries || "1C26TAA",
              invoice_no: invoiceNo,
              issue_date: issueDate || new Date().toISOString().slice(0, 10),
              subtotal,
              vat_amount: vatAmount,
              total,
              currency,
              status: "issued",
              einvoice_code: mccqt || null,
            })
            .select("id")
            .single();
          if (sErr || !sinv) throw new Error(sErr?.message || "Không tạo được hoá đơn bán");

          if (lines.length) {
            await supabase.from("sales_invoice_lines").insert(
              lines.map((l) => ({
                invoice_id: sinv.id,
                description: l.description || "Hàng hoá / dịch vụ",
                qty: l.qty,
                unit_price: l.unit_price,
                amount: l.amount,
                vat_rate: l.vat_rate,
                vat_code: `${l.vat_rate || 0}`,
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
          });
        }
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
