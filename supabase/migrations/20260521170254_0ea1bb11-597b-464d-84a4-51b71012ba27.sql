
-- purchase_voucher_lines additions
ALTER TABLE public.purchase_voucher_lines
  ADD COLUMN IF NOT EXISTS product_code text,
  ADD COLUMN IF NOT EXISTS product_name text,
  ADD COLUMN IF NOT EXISTS unit text,
  ADD COLUMN IF NOT EXISTS debit_account text,
  ADD COLUMN IF NOT EXISTS vat_account text,
  ADD COLUMN IF NOT EXISTS discount_pct numeric(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_amount numeric(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vat_amount numeric(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total numeric(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS invoice_id uuid,
  ADD COLUMN IF NOT EXISTS invoice_no text,
  ADD COLUMN IF NOT EXISTS note text;

-- purchase_vouchers additions
ALTER TABLE public.purchase_vouchers
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'unpaid',
  ADD COLUMN IF NOT EXISTS invoice_receipt_type text NOT NULL DEFAULT 'with_invoice',
  ADD COLUMN IF NOT EXISTS is_purchase_cost boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_non_deductible boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS supplier_address text,
  ADD COLUMN IF NOT EXISTS customer_group text,
  ADD COLUMN IF NOT EXISTS exchange_rate numeric(18,6) NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS due_date date,
  ADD COLUMN IF NOT EXISTS discount_pct numeric(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_amount numeric(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS auto_allocate_cost boolean NOT NULL DEFAULT false;

-- relax checks via drop+recreate so older check stays compatible
DO $$ BEGIN
  ALTER TABLE public.purchase_vouchers
    ADD CONSTRAINT purchase_vouchers_payment_status_check
    CHECK (payment_status IN ('unpaid','partial','paid'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.purchase_vouchers
    ADD CONSTRAINT purchase_vouchers_invoice_receipt_type_check
    CHECK (invoice_receipt_type IN ('with_invoice','without_invoice','invoice_only'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
