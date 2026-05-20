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
    const methodLabel: Record<string, string> = { cash: "Tiền mặt", bank: "Chuyển khoản", card: "Thẻ", other: "Khác" };
    const ml = methodLabel[input.method];
    return [
      `Thu tiền HĐ **${inv.invoice_no}** — ${inv.customer_name}`,
      `Hình thức: ${ml} | Ngày: ${input.pay_date}`,
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

// ============= Handler: recordSupplierPayment =============
const RecordSupplierPaymentInput = z.object({
  invoice_id: z.string().uuid().optional(),
  supplier_id: z.string().uuid().optional(),
  supplier_name: z.string().optional(),
  pay_date: z.string(),
  method: z.enum(["cash", "bank"]),
  amount: z.number().positive(),
  reference: z.string().optional(),
});

const recordSupplierPayment: ActionHandler = {
  schema: RecordSupplierPaymentInput,
  preview: async (input, { supabase }) => {
    let invLabel = "";
    if (input.invoice_id) {
      const { data: inv } = await supabase
        .from("invoices")
        .select("invoice_no, supplier_name, total, payment_status")
        .eq("id", input.invoice_id)
        .single();
      if (inv) invLabel = `HĐ mua **${inv.invoice_no}** — ${inv.supplier_name} (tổng ${Number(inv.total).toLocaleString("vi-VN")} ₫)`;
    }
    const methodLabel: Record<string, string> = { cash: "Tiền mặt", bank: "Chuyển khoản" };
    return [
      `Chi trả NCC ${input.supplier_name ? `**${input.supplier_name}**` : ""}`,
      invLabel,
      `Hình thức: ${methodLabel[input.method]} | Ngày: ${input.pay_date}`,
      `Số tiền: **${input.amount.toLocaleString("vi-VN")} ₫**`,
      input.reference ? `Tham chiếu: ${input.reference}` : "",
    ].filter(Boolean).join("\n");
  },
  execute: async (input) => {
    const { recordPayment } = await import("@/lib/payables.functions");
    await (recordPayment as any)({ data: input });
    return { ref_table: "supplier_payments", message: "Đã ghi nhận khoản chi NCC" };
  },
};

// ============= Handler: createBankVoucher =============
const BankVoucherInput = z.object({
  voucher_no: z.string().min(1),
  voucher_type: z.enum(["receipt", "payment"]),
  voucher_date: z.string(),
  bank_account_id: z.string().uuid(),
  amount: z.number().positive(),
  counter_account: z.string().min(3),
  party_name: z.string().optional(),
  reason: z.string().optional(),
  reference: z.string().optional(),
});

const createBankVoucherAction: ActionHandler = {
  schema: BankVoucherInput,
  preview: async (input, { supabase }) => {
    const { data: acc } = await supabase
      .from("bank_accounts")
      .select("name, bank_name, account_no")
      .eq("id", input.bank_account_id)
      .single();
    const accLabel = acc ? `${acc.name} (${acc.bank_name || ""} ${acc.account_no || ""})` : "TK ngân hàng";
    const typeLabel = input.voucher_type === "receipt" ? "**Báo có** (thu)" : "**Báo nợ** (chi)";
    return [
      `${typeLabel} ${input.voucher_no} — ${input.voucher_date}`,
      `TK ngân hàng: ${accLabel}`,
      `Đối ứng: ${input.counter_account}${input.party_name ? ` | ${input.party_name}` : ""}`,
      `Số tiền: **${input.amount.toLocaleString("vi-VN")} ₫**`,
      input.reason ? `Diễn giải: ${input.reason}` : "",
    ].filter(Boolean).join("\n");
  },
  execute: async (input) => {
    const { createBankVoucher } = await import("@/lib/bank.functions");
    const result: any = await (createBankVoucher as any)({ data: input });
    return { ref_table: "bank_vouchers", ref_id: result?.id, message: `Đã tạo phiếu ${input.voucher_no}` };
  },
};

// ============= Handler: createBankTransfer =============
const BankTransferInput = z.object({
  voucher_no: z.string().min(1),
  voucher_date: z.string(),
  from_account_id: z.string().uuid(),
  to_account_id: z.string().uuid(),
  amount: z.number().positive(),
  reason: z.string().optional(),
});

const createBankTransferAction: ActionHandler = {
  schema: BankTransferInput,
  preview: async (input, { supabase }) => {
    const { data: accs } = await supabase
      .from("bank_accounts")
      .select("id, name, bank_name")
      .in("id", [input.from_account_id, input.to_account_id]);
    const map = new Map((accs ?? []).map((a: any) => [a.id, a]));
    const from: any = map.get(input.from_account_id);
    const to: any = map.get(input.to_account_id);
    return [
      `**Chuyển khoản nội bộ** ${input.voucher_no} — ${input.voucher_date}`,
      `Từ: ${from?.name || "?"} (${from?.bank_name || ""})`,
      `Đến: ${to?.name || "?"} (${to?.bank_name || ""})`,
      `Số tiền: **${input.amount.toLocaleString("vi-VN")} ₫**`,
      input.reason ? `Diễn giải: ${input.reason}` : "",
    ].filter(Boolean).join("\n");
  },
  execute: async (input) => {
    const { createBankTransfer } = await import("@/lib/bank.functions");
    await (createBankTransfer as any)({ data: input });
    return { ref_table: "bank_vouchers", message: `Đã tạo phiếu chuyển khoản ${input.voucher_no}` };
  },
};

// ============= Handler: createPurchaseInvoice =============
const PurchaseInvoiceLineInput = z.object({
  description: z.string().min(1),
  qty: z.number().min(0).default(1),
  unit_price: z.number().min(0).default(0),
  amount: z.number().min(0),
  vat_rate: z.number().min(0).max(100).default(0),
});

const PurchaseInvoiceInput = z.object({
  supplier_name: z.string().optional(),
  supplier_tax_id: z.string().optional(),
  invoice_no: z.string().optional(),
  issue_date: z.string(),
  notes: z.string().optional(),
  expense_account: z.string().min(3).max(20).optional(),
  lines: z.array(PurchaseInvoiceLineInput).min(1),
});

const createPurchaseInvoice: ActionHandler = {
  schema: PurchaseInvoiceInput,
  preview: async (input) => {
    const subtotal = input.lines.reduce((s: number, l: any) => s + Number(l.amount || 0), 0);
    const vat = input.lines.reduce(
      (s: number, l: any) => s + Number(l.amount || 0) * (Number(l.vat_rate || 0) / 100),
      0,
    );
    const total = subtotal + vat;
    const dr = input.expense_account || "1561";
    return [
      `Tạo HĐ mua **${input.invoice_no || "(chưa số)"}** — ${input.supplier_name || "NCC?"}`,
      `Ngày: ${input.issue_date}`,
      ...input.lines.slice(0, 5).map(
        (l: any) => `• ${l.description}: ${l.qty} × ${Number(l.unit_price).toLocaleString("vi-VN")} = ${Number(l.amount).toLocaleString("vi-VN")} ₫`,
      ),
      input.lines.length > 5 ? `… +${input.lines.length - 5} dòng` : "",
      `Subtotal: ${subtotal.toLocaleString("vi-VN")} ₫ | VAT: ${vat.toLocaleString("vi-VN")} ₫`,
      `**Tổng: ${total.toLocaleString("vi-VN")} ₫**`,
      `Bút toán: Nợ ${dr} / Có 331 = ${subtotal.toLocaleString("vi-VN")}${vat > 0 ? ` ; Nợ 1331 / Có 331 = ${vat.toLocaleString("vi-VN")}` : ""}`,
    ].filter(Boolean).join("\n");
  },
  execute: async (input) => {
    const { createManualInvoice } = await import("@/lib/purchases.functions");
    const result: any = await (createManualInvoice as any)({
      data: {
        ...input,
        expense_account: input.expense_account,
        lines: input.lines.map((l: any) => ({ ...l, line_type: "goods" })),
      },
    });
    return { ref_table: "invoices", ref_id: result?.id, message: "Đã tạo hoá đơn mua nháp" };
  },
};

export const ACTION_HANDLERS: Record<string, ActionHandler> = {
  createInvoiceFromSO,
  recordCustomerReceipt,
  recordSupplierPayment,
  createBankVoucher: createBankVoucherAction,
  createBankTransfer: createBankTransferAction,
  createPurchaseInvoice,
};

export const ACTION_CATALOG = Object.keys(ACTION_HANDLERS);
