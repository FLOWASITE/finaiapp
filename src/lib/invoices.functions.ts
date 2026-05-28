import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { generateText, Output } from "ai";
import { withTenant } from "@/integrations/supabase/with-tenant";
import { resolveActiveModel, resolveAgentModel } from "@/lib/ai-gateway.server";
import {
  lookupGlobalSupplier,
  contributeGlobalSupplier,
} from "@/lib/ai/global-supplier.server";

const InvoiceLineSchema = z.object({
  description: z.string(),
  qty: z.number().default(1),
  unit_price: z.number().default(0),
  amount: z.number().default(0),
  vat_rate: z.number().default(0),
});

const InvoiceSchema = z.object({
  supplier_name: z.string().describe("Tên đầy đủ của bên bán"),
  supplier_tax_id: z
    .string()
    .describe("Mã số thuế bên bán (10 hoặc 13 chữ số). Bỏ qua nếu không thấy."),
  invoice_no: z.string().describe("Số hóa đơn / Số chứng từ"),
  issue_date: z.string().describe("Ngày phát hành định dạng YYYY-MM-DD"),
  subtotal: z.number().describe("Tổng tiền hàng trước thuế (VNĐ)"),
  vat_amount: z.number().describe("Tổng tiền thuế GTGT (VNĐ)"),
  total: z.number().describe("Tổng cộng phải thanh toán (VNĐ)"),
  lines: z.array(InvoiceLineSchema).describe("Các dòng hàng/dịch vụ trên hóa đơn"),
});

export const extractInvoice = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((input: { invoiceId: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId, tenantId } = context;
    const { model } = await resolveAgentModel("invoice_extract", "google/gemini-3-flash-preview");

    // 1. Lấy invoice + signed URL file
    const { data: invoice, error: invErr } = await supabase
      .from("invoices")
      .select("id, file_path, user_id")
      .eq("id", data.invoiceId)
      .eq("tenant_id", tenantId)
      .single();
    if (invErr || !invoice) throw new Error("Không tìm thấy hóa đơn");

    const { data: signed, error: sErr } = await supabase.storage
      .from("invoices")
      .createSignedUrl(invoice.file_path, 60 * 5);
    if (sErr || !signed) throw new Error("Không tạo được URL file");

    // 2. Tải file → base64
    const fileRes = await fetch(signed.signedUrl);
    if (!fileRes.ok) throw new Error("Không tải được file hóa đơn");
    const buf = await fileRes.arrayBuffer();
    const base64 = Buffer.from(buf).toString("base64");
    const mime = fileRes.headers.get("content-type") || "image/jpeg";

    try {
      const { experimental_output } = await generateText({
        model,
        experimental_output: Output.object({ schema: InvoiceSchema }),
        messages: [
          {
            role: "system",
            content:
              "Bạn là chuyên gia bóc tách hóa đơn Việt Nam. Đọc kỹ ảnh/PDF hóa đơn và trích chính xác các trường. Mã số thuế VN có 10 hoặc 13 chữ số. Thuế suất GTGT thường gặp: 0, 5, 8, 10%. Tiền tệ mặc định VNĐ — chỉ trả con số nguyên, không kèm đơn vị. Nếu trường nào không đọc được, để chuỗi rỗng hoặc số 0.",
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Hãy bóc tách hóa đơn trong file đính kèm." },
              { type: "file", data: base64, mediaType: mime },
            ],
          },
        ],
      });

      const result = experimental_output;

      // 4. Tìm/tạo supplier
      let supplierId: string | null = null;
      if (result.supplier_tax_id) {
        const { data: existing } = await supabase
          .from("suppliers")
          .select("id")
          .eq("tenant_id", tenantId)
          .eq("tax_id", result.supplier_tax_id)
          .maybeSingle();
        if (existing) supplierId = existing.id;
        else {
          const { data: created } = await supabase
            .from("suppliers")
            .insert({
              user_id: userId,
              tenant_id: tenantId,
              tax_id: result.supplier_tax_id,
              name: result.supplier_name || "Chưa rõ",
            })
            .select("id")
            .single();
          supplierId = created?.id ?? null;
        }
      }

      // 5. Update invoice
      await supabase
        .from("invoices")
        .update({
          supplier_id: supplierId,
          supplier_name: result.supplier_name,
          supplier_tax_id: result.supplier_tax_id,
          invoice_no: result.invoice_no,
          issue_date: result.issue_date || null,
          subtotal: result.subtotal,
          vat_amount: result.vat_amount,
          total: result.total,
          status: "extracted",
          raw_ocr: result,
          updated_at: new Date().toISOString(),
        })
        .eq("id", invoice.id)
        .eq("tenant_id", tenantId);

      // 6. Insert lines
      await supabase.from("invoice_lines").delete().eq("invoice_id", invoice.id);
      if (result.lines.length > 0) {
        await supabase.from("invoice_lines").insert(
          result.lines.map((l) => ({
            invoice_id: invoice.id,
            description: l.description,
            qty: l.qty,
            unit_price: l.unit_price,
            amount: l.amount,
            vat_rate: l.vat_rate,
          })),
        );
      }

      return { ok: true, extracted: result };
    } catch (err) {
      await supabase
        .from("invoices")
        .update({ status: "failed", notes: String(err) })
        .eq("id", invoice.id)
        .eq("tenant_id", tenantId);
      throw err;
    }
  });
