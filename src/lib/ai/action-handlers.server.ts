/**
 * Server-only registry of AI action handlers.
 * Each handler receives (input, ctx) and returns { ref_table, ref_id, summary }.
 * Called from approveAction after the user has explicitly approved.
 */
import { z } from "zod";

export type ActionContext = { supabase: any; userId: string };
export type ActionResult = {
  ref_table?: string;
  ref_id?: string;
  message?: string;
};

export type ActionHandler = {
  schema: z.ZodTypeAny;
  /** Returns a human-readable preview shown to the user before approval. */
  preview: (input: any, ctx: ActionContext) => Promise<string>;
  execute: (input: any, ctx: ActionContext) => Promise<ActionResult>;
};

// ============= Handler: createInvoiceFromSO =============
const CreateInvoiceInput = z.object({
  orderId: z.string().uuid(),
  issueDate: z.string().optional(),
  lines: z
    .array(z.object({ soLineId: z.string().uuid(), qty: z.number().positive() }))
    .min(1),
});

const createInvoiceFromSO: ActionHandler = {
  schema: CreateInvoiceInput,
  preview: async (input, { supabase }) => {
    const { data: order } = await supabase
      .from("sales_orders")
      .select("order_no, customer_name, currency, sales_order_lines(id, description, qty_ordered, qty_delivered, unit_price, vat_rate)")
      .eq("id", input.orderId)
      .single();
    if (!order) throw new Error("Không tìm thấy đơn đặt hàng");
    const byId = new Map((order.sales_order_lines ?? []).map((l: any) => [l.id, l]));
    let total = 0;
    const lines = input.lines.map((r: any) => {
      const sl: any = byId.get(r.soLineId);
      if (!sl) throw new Error("Dòng đơn không hợp lệ");
      const amount = r.qty * Number(sl.unit_price || 0);
      const vat = amount * (Number(sl.vat_rate || 0) / 100);
      total += amount + vat;
      return `• ${sl.description}: ${r.qty} × ${Number(sl.unit_price || 0).toLocaleString("vi-VN")}`;
    });
    return [
      `Xuất hoá đơn từ đơn ${order.order_no} (KH: ${order.customer_name})`,
      ...lines,
      `**Tổng (gồm VAT): ${total.toLocaleString("vi-VN")} ${order.currency || "VND"}**`,
    ].join("\n");
  },
  execute: async (input, { supabase, userId }) => {
    // Re-use the existing logic via direct import (server-only safe).
    const { createInvoiceFromSalesOrder } = await import("@/lib/sales.functions");
    // Call the underlying handler. createServerFn-wrapped functions execute the
    // handler directly when invoked server-side without HTTP.
    const result: any = await (createInvoiceFromSalesOrder as any)({ data: input });
    return {
      ref_table: "sales_invoices",
      ref_id: result?.id,
      message: `Đã tạo hoá đơn nháp ${result?.invoice_no || ""}`,
    };
  },
};

// ============= Handler: recordCustomerReceipt =============
const RecordReceiptInput = z.object({
  invoice_id: z.string().uuid(),
  pay_date: z.string(),
  method: z.enum(["cash", "bank", "card", "other"]),
  amount: z.number().positive(),
  reference: z.string().optional(),
  notes: z.string().optional(),
});

const recordCustomerReceipt: ActionHandler = {
  schema: RecordReceiptInput,
  preview: async (input, { supabase }) => {
    const { data: inv } = await supabase
      .from("sales_invoices")
      .select("invoice_no, customer_name, total, paid_amount")
      .eq("id", input.invoice_id)
      .single();
    if (!inv) throw new Error("Không tìm thấy hoá đơn");
    const remaining = Number(inv.total) - Number(inv.paid_amount || 0);
    const methodLabel = { cash: "Tiền mặt", bank: "Chuyển khoản", card: "Thẻ", other: "Khác" }[input.method];
    return [
      `Thu tiền HĐ **${inv.invoice_no}** — ${inv.customer_name}`,
      `Hình thức: ${methodLabel} | Ngày: ${input.pay_date}`,
      `Số tiền: **${input.amount.toLocaleString("vi-VN")} ₫** (còn nợ ${remaining.toLocaleString("vi-VN")} ₫)`,
      input.reference ? `Tham chiếu: ${input.reference}` : "",
    ].filter(Boolean).join("\n");
  },
  execute: async (input) => {
    const { recordReceipt } = await import("@/lib/receipts.functions");
    await (recordReceipt as any)({ data: input });
    return {
      ref_table: "customer_receipts",
      message: "Đã ghi nhận khoản thu",
    };
  },
};

export const ACTION_HANDLERS: Record<string, ActionHandler> = {
  createInvoiceFromSO,
  recordCustomerReceipt,
};

export const ACTION_CATALOG = Object.keys(ACTION_HANDLERS);
