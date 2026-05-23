ALTER TABLE public.purchase_vouchers
  ADD COLUMN IF NOT EXISTS stock_voucher_no text,
  ADD COLUMN IF NOT EXISTS stock_voucher_date date,
  ADD COLUMN IF NOT EXISTS stock_voucher_reason text;

ALTER TABLE public.sales_vouchers
  ADD COLUMN IF NOT EXISTS stock_voucher_no text,
  ADD COLUMN IF NOT EXISTS stock_voucher_date date,
  ADD COLUMN IF NOT EXISTS stock_voucher_reason text;