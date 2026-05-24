ALTER TABLE public.sales_vouchers
  ADD COLUMN IF NOT EXISTS einvoice_series text,
  ADD COLUMN IF NOT EXISTS einvoice_no text;

CREATE UNIQUE INDEX IF NOT EXISTS sales_vouchers_tenant_einvoice_uniq
  ON public.sales_vouchers (tenant_id, einvoice_series, einvoice_no)
  WHERE einvoice_series IS NOT NULL AND einvoice_no IS NOT NULL AND status <> 'void';

CREATE INDEX IF NOT EXISTS sales_vouchers_tenant_einvoice_lookup
  ON public.sales_vouchers (tenant_id, einvoice_no)
  WHERE einvoice_no IS NOT NULL;