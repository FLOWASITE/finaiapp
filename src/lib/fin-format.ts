// Fin export format — schema v1
export const FIN_FORMAT_VERSION = 1 as const;

export type FinExportTable =
  | "journal_entries"
  | "journal_lines"
  | "invoices"
  | "invoice_lines"
  | "sales_invoices"
  | "sales_invoice_lines"
  | "cash_vouchers"
  | "customer_receipts"
  | "supplier_payments"
  | "bank_transactions"
  | "payroll_runs"
  | "payroll_lines"
  | "fixed_assets"
  | "depreciation_entries"
  | "account_period_balances"
  // catalogs (optional)
  | "customers"
  | "suppliers"
  | "products"
  | "chart_of_accounts"
  | "units"
  | "warehouses"
  | "branches"
  | "departments"
  | "projects"
  | "cost_centers";

export interface FinExportFile {
  format: "fin-export";
  version: number;
  tenant: { id: string; company_name: string | null; tax_id: string | null };
  fiscal_year: number;
  exported_at: string;
  exported_by: string;
  options: {
    include_catalogs: boolean;
    selected_tables: FinExportTable[];
  };
  row_counts: Partial<Record<FinExportTable, number>>;
  tables: Partial<Record<FinExportTable, any[]>>;
}

// Tables scoped by fiscal year (filtered by a date column)
export const YEAR_SCOPED_TABLES: Record<
  Exclude<FinExportTable, "account_period_balances" | "journal_lines" | "invoice_lines" | "sales_invoice_lines" | "payroll_lines" | "depreciation_entries" | "customers" | "suppliers" | "products" | "chart_of_accounts" | "units" | "warehouses" | "branches" | "departments" | "projects" | "cost_centers" | "fixed_assets">,
  string
> = {
  journal_entries: "entry_date",
  invoices: "issue_date",
  sales_invoices: "issue_date",
  cash_vouchers: "voucher_date",
  customer_receipts: "pay_date",
  supplier_payments: "pay_date",
  bank_transactions: "txn_date",
  payroll_runs: "period_start",
};

export const CATALOG_TABLES: FinExportTable[] = [
  "customers",
  "suppliers",
  "products",
  "chart_of_accounts",
  "units",
  "warehouses",
  "branches",
  "departments",
  "projects",
  "cost_centers",
];

export const DEFAULT_EXPORT_GROUPS: { id: string; label: string; tables: FinExportTable[] }[] = [
  { id: "journal", label: "Bút toán & sổ cái", tables: ["journal_entries", "journal_lines"] },
  { id: "purchase", label: "Hoá đơn mua + dòng", tables: ["invoices", "invoice_lines"] },
  { id: "sales", label: "Hoá đơn bán + dòng", tables: ["sales_invoices", "sales_invoice_lines"] },
  { id: "cash", label: "Thu/chi tiền mặt", tables: ["cash_vouchers"] },
  { id: "receipt_pay", label: "Thu của KH / Trả NCC", tables: ["customer_receipts", "supplier_payments"] },
  { id: "bank", label: "Ngân hàng", tables: ["bank_transactions"] },
  { id: "payroll", label: "Lương", tables: ["payroll_runs", "payroll_lines"] },
  { id: "fa", label: "TSCĐ & khấu hao", tables: ["fixed_assets", "depreciation_entries"] },
  { id: "balances", label: "Số dư tài khoản theo kỳ", tables: ["account_period_balances"] },
];

export function isFinExport(obj: any): obj is FinExportFile {
  return (
    obj &&
    typeof obj === "object" &&
    obj.format === "fin-export" &&
    typeof obj.version === "number" &&
    obj.tenant &&
    typeof obj.fiscal_year === "number" &&
    obj.tables &&
    typeof obj.tables === "object"
  );
}
