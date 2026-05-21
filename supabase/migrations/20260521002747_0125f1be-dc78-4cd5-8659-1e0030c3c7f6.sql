ALTER TABLE public.einvoices ADD COLUMN IF NOT EXISTS matched_at timestamptz;

CREATE OR REPLACE FUNCTION public.tg_einvoices_set_matched_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (NEW.matched_purchase_invoice_id IS NOT NULL AND (OLD.matched_purchase_invoice_id IS NULL OR OLD.matched_purchase_invoice_id IS DISTINCT FROM NEW.matched_purchase_invoice_id))
     OR (NEW.matched_sales_invoice_id IS NOT NULL AND (OLD.matched_sales_invoice_id IS NULL OR OLD.matched_sales_invoice_id IS DISTINCT FROM NEW.matched_sales_invoice_id)) THEN
    NEW.matched_at := now();
  ELSIF NEW.matched_purchase_invoice_id IS NULL AND NEW.matched_sales_invoice_id IS NULL THEN
    NEW.matched_at := NULL;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_einvoices_matched_at ON public.einvoices;
CREATE TRIGGER trg_einvoices_matched_at
BEFORE UPDATE OF matched_purchase_invoice_id, matched_sales_invoice_id ON public.einvoices
FOR EACH ROW EXECUTE FUNCTION public.tg_einvoices_set_matched_at();

CREATE INDEX IF NOT EXISTS idx_einvoices_matched_at ON public.einvoices(tenant_id, matched_at DESC) WHERE matched_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_einvoices_xml_fetched_at ON public.einvoices(tenant_id, xml_fetched_at DESC) WHERE xml_fetched_at IS NOT NULL;