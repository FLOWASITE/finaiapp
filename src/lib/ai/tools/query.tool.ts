import { tool } from "ai";
import { z } from "zod";

/**
 * Read-only data query tool. Wraps Supabase select with user_id scoping
 * for tables that need it. Used by the AI copilot to fetch data on demand.
 */
export function makeRunQueryTool(supabase: any, userId: string) {
  return tool({
    description:
      "Truy vấn dữ liệu kế toán/ERP. Truyền tên bảng và filter (cột=giá trị). Hỗ trợ select cột, gte/lte cho khoảng ngày/số, order, limit.",
    inputSchema: z.object({
      table: z.enum([
        "invoices", "invoice_lines", "suppliers", "customers",
        "journal_entries", "journal_lines", "chart_of_accounts",
        "bank_accounts", "bank_transactions", "fixed_assets", "depreciation_entries",
        "products", "stock_movements", "cash_vouchers",
        "sales_invoices", "sales_invoice_lines",
        "sales_orders", "sales_order_lines",
      ]),
      select: z.string().default("*").describe("Cột cần lấy, ví dụ 'supplier_name, total' hoặc '*'"),
      filters: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
      gte: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
      lte: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
      order_by: z.string().optional(),
      ascending: z.boolean().default(false),
      limit: z.number().default(50),
    }),
    execute: async (input) => {
      let q: any = supabase.from(input.table).select(input.select);
      const userScoped = [
        "invoices", "suppliers", "customers", "journal_entries", "bank_accounts",
        "bank_transactions", "fixed_assets", "products", "stock_movements",
        "cash_vouchers", "sales_invoices", "sales_orders",
      ];
      if (userScoped.includes(input.table)) q = q.eq("user_id", userId);
      if (input.filters) for (const [k, v] of Object.entries(input.filters)) q = q.eq(k, v);
      if (input.gte) for (const [k, v] of Object.entries(input.gte)) q = q.gte(k, v);
      if (input.lte) for (const [k, v] of Object.entries(input.lte)) q = q.lte(k, v);
      if (input.order_by) q = q.order(input.order_by, { ascending: input.ascending });
      q = q.limit(Math.min(input.limit, 200));
      const { data, error } = await q;
      if (error) return { error: error.message };
      return { rows: data };
    },
  });
}

export const SCHEMA_HINT = `Bảng dữ liệu (Postgres) — luôn lọc theo user_id của user hiện tại:
- invoices(id, supplier_name, supplier_tax_id, invoice_no, issue_date, subtotal, vat_amount, total, status, user_id)
- invoice_lines(invoice_id, description, qty, unit_price, amount, vat_rate)
- suppliers(id, name, tax_id, user_id)
- customers(id, name, tax_id, user_id)
- journal_entries(id, entry_date, description, user_id)
- journal_lines(entry_id, account_code, debit, credit)
- chart_of_accounts(code, name, type)
- bank_accounts(id, name, bank_name, user_id)
- bank_transactions(id, bank_account_id, txn_date, description, amount, status, user_id)
- fixed_assets(id, code, name, cost, useful_life_months, start_date, user_id)
- depreciation_entries(asset_id, period_month, amount)
- products(id, code, name, unit, on_hand, unit_cost, unit_price, user_id)
- stock_movements(id, product_id, movement_type, qty, unit_cost, movement_date, user_id)
- cash_vouchers(id, voucher_no, voucher_type, voucher_date, amount, counter_account, party_name, reason, user_id)
- sales_invoices(id, einvoice_code, invoice_no, issue_date, customer_name, customer_tax_id, subtotal, vat_amount, total, status, user_id)
- sales_invoice_lines(invoice_id, description, qty, unit_price, amount, vat_rate, sales_order_line_id)
- sales_orders(id, order_no, order_date, customer_id, status, total, user_id)
- sales_order_lines(order_id, description, qty_ordered, qty_delivered, unit_price)`;
