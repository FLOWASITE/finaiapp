
-- journal_lines: critical for ledger reports
CREATE INDEX IF NOT EXISTS idx_journal_lines_entry_id ON public.journal_lines (entry_id);
CREATE INDEX IF NOT EXISTS idx_journal_lines_account_code ON public.journal_lines (account_code);
CREATE INDEX IF NOT EXISTS idx_journal_lines_account_entry ON public.journal_lines (account_code, entry_id);

-- journal_entries: tenant + date for trial balance / general ledger
CREATE INDEX IF NOT EXISTS idx_journal_entries_tenant_date ON public.journal_entries (tenant_id, entry_date DESC);

-- sales_invoices: tenant + date / status for dashboards
CREATE INDEX IF NOT EXISTS idx_sales_invoices_tenant_date ON public.sales_invoices (tenant_id, issue_date DESC);
CREATE INDEX IF NOT EXISTS idx_sales_invoices_tenant_status ON public.sales_invoices (tenant_id, status, payment_status);

-- invoices (purchases): tenant + date / status
CREATE INDEX IF NOT EXISTS idx_invoices_tenant_date ON public.invoices (tenant_id, issue_date DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_tenant_status ON public.invoices (tenant_id, status);

-- customer_receipts / supplier_payments: tenant + pay_date
CREATE INDEX IF NOT EXISTS idx_customer_receipts_tenant_date ON public.customer_receipts (tenant_id, pay_date DESC);
CREATE INDEX IF NOT EXISTS idx_supplier_payments_tenant_date ON public.supplier_payments (tenant_id, pay_date DESC);
CREATE INDEX IF NOT EXISTS idx_supplier_payments_invoice_id ON public.supplier_payments (invoice_id);

-- cash_vouchers / bank_vouchers: tenant + voucher_date
CREATE INDEX IF NOT EXISTS idx_cash_vouchers_tenant_date ON public.cash_vouchers (tenant_id, voucher_date DESC);
CREATE INDEX IF NOT EXISTS idx_bank_vouchers_tenant_date ON public.bank_vouchers (tenant_id, voucher_date DESC);
