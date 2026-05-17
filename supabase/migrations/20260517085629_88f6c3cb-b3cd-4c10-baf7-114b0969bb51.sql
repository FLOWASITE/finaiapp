
ALTER TABLE public.invoice_lines
  ADD COLUMN IF NOT EXISTS product_id uuid,
  ADD COLUMN IF NOT EXISTS line_type text NOT NULL DEFAULT 'goods';

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'unpaid',
  ADD COLUMN IF NOT EXISTS expense_account text;

ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS payment_terms_days integer NOT NULL DEFAULT 30;

CREATE OR REPLACE FUNCTION public.refresh_invoice_payment_status()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_invoice_id uuid;
  v_total numeric;
  v_paid numeric;
BEGIN
  v_invoice_id := COALESCE(NEW.invoice_id, OLD.invoice_id);
  IF v_invoice_id IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;

  SELECT total INTO v_total FROM public.invoices WHERE id = v_invoice_id;
  SELECT COALESCE(SUM(amount), 0) INTO v_paid FROM public.supplier_payments WHERE invoice_id = v_invoice_id;

  UPDATE public.invoices SET payment_status =
    CASE
      WHEN v_paid <= 0 THEN 'unpaid'
      WHEN v_paid + 0.01 < COALESCE(v_total, 0) THEN 'partial'
      ELSE 'paid'
    END
  WHERE id = v_invoice_id;

  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS trg_supplier_payment_refresh ON public.supplier_payments;
CREATE TRIGGER trg_supplier_payment_refresh
AFTER INSERT OR UPDATE OR DELETE ON public.supplier_payments
FOR EACH ROW EXECUTE FUNCTION public.refresh_invoice_payment_status();
