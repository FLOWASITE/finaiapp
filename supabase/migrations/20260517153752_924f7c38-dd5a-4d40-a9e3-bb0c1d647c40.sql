
-- ============ CUSTOMERS extensions ============
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS code text,
  ADD COLUMN IF NOT EXISTS payment_terms_days integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'VND',
  ADD COLUMN IF NOT EXISTS opening_balance numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS email_cc text,
  ADD COLUMN IF NOT EXISTS contact_person text,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

CREATE UNIQUE INDEX IF NOT EXISTS customers_tenant_code_unique
  ON public.customers (tenant_id, lower(code))
  WHERE code IS NOT NULL AND tenant_id IS NOT NULL;

-- ============ SALES_INVOICES extensions ============
ALTER TABLE public.sales_invoices
  ADD COLUMN IF NOT EXISTS discount_percent numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS shipping_fee numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS other_fees numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fx_rate numeric NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'unpaid'
    CHECK (payment_status IN ('unpaid','partial','paid','overdue','void')),
  ADD COLUMN IF NOT EXISTS paid_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS due_date date,
  ADD COLUMN IF NOT EXISTS payment_terms_days integer,
  ADD COLUMN IF NOT EXISTS billing_address text,
  ADD COLUMN IF NOT EXISTS shipping_address text,
  ADD COLUMN IF NOT EXISTS customer_email text,
  ADD COLUMN IF NOT EXISTS quote_id uuid,
  ADD COLUMN IF NOT EXISTS sales_order_id uuid,
  ADD COLUMN IF NOT EXISTS einvoice_template_id uuid,
  ADD COLUMN IF NOT EXISTS send_status text NOT NULL DEFAULT 'not_sent'
    CHECK (send_status IN ('not_sent','queued','sent','failed')),
  ADD COLUMN IF NOT EXISTS sent_at timestamptz;

-- ============ SALES_INVOICE_LINES extensions ============
ALTER TABLE public.sales_invoice_lines
  ADD COLUMN IF NOT EXISTS line_discount_percent numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS line_discount_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vat_code text NOT NULL DEFAULT '10'
    CHECK (vat_code IN ('0','5','8','10','KCT','KKKNT')),
  ADD COLUMN IF NOT EXISTS pre_vat_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS line_vat_amount numeric NOT NULL DEFAULT 0;

-- ============ CUSTOMER_RECEIPTS (mirror supplier_payments) ============
CREATE TABLE IF NOT EXISTS public.customer_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  tenant_id uuid,
  invoice_id uuid,
  customer_id uuid,
  customer_name text,
  pay_date date NOT NULL DEFAULT CURRENT_DATE,
  method text NOT NULL DEFAULT 'cash' CHECK (method IN ('cash','bank','card','other')),
  amount numeric NOT NULL CHECK (amount > 0),
  reference text,
  notes text,
  journal_entry_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS customer_receipts_invoice_idx ON public.customer_receipts(invoice_id);
CREATE INDEX IF NOT EXISTS customer_receipts_tenant_idx ON public.customer_receipts(tenant_id);

ALTER TABLE public.customer_receipts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own customer_receipts all"
  ON public.customer_receipts FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "tenant customer_receipts select"
  ON public.customer_receipts FOR SELECT
  USING (tenant_id IS NOT NULL AND is_tenant_member(auth.uid(), tenant_id));

CREATE POLICY "tenant customer_receipts insert"
  ON public.customer_receipts FOR INSERT
  WITH CHECK (
    tenant_id IS NOT NULL
    AND tenant_id = current_tenant_id()
    AND has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin','accountant'])
  );

CREATE POLICY "tenant customer_receipts update"
  ON public.customer_receipts FOR UPDATE
  USING (tenant_id IS NOT NULL AND has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin','accountant']))
  WITH CHECK (tenant_id IS NOT NULL AND has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin','accountant']));

CREATE POLICY "tenant customer_receipts delete"
  ON public.customer_receipts FOR DELETE
  USING (tenant_id IS NOT NULL AND has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin','accountant']));

-- ============ Trigger: refresh sales_invoices payment_status ============
CREATE OR REPLACE FUNCTION public.refresh_sales_invoice_payment_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice_id uuid;
  v_total numeric;
  v_paid numeric;
  v_due date;
  v_status text;
BEGIN
  v_invoice_id := COALESCE(NEW.invoice_id, OLD.invoice_id);
  IF v_invoice_id IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;

  SELECT total, due_date INTO v_total, v_due FROM public.sales_invoices WHERE id = v_invoice_id;
  SELECT COALESCE(SUM(amount), 0) INTO v_paid FROM public.customer_receipts WHERE invoice_id = v_invoice_id;

  v_status := CASE
    WHEN v_paid <= 0 THEN
      CASE WHEN v_due IS NOT NULL AND v_due < CURRENT_DATE THEN 'overdue' ELSE 'unpaid' END
    WHEN v_paid + 0.01 < COALESCE(v_total, 0) THEN 'partial'
    ELSE 'paid'
  END;

  UPDATE public.sales_invoices
  SET payment_status = v_status,
      paid_amount = v_paid,
      updated_at = now()
  WHERE id = v_invoice_id;

  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS customer_receipts_refresh_payment ON public.customer_receipts;
CREATE TRIGGER customer_receipts_refresh_payment
AFTER INSERT OR UPDATE OR DELETE ON public.customer_receipts
FOR EACH ROW EXECUTE FUNCTION public.refresh_sales_invoice_payment_status();
