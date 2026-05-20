
-- 1. Add file_hash to document tables
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS file_hash text;
CREATE INDEX IF NOT EXISTS idx_invoices_file_hash ON public.invoices(file_hash) WHERE file_hash IS NOT NULL;

ALTER TABLE public.bank_vouchers ADD COLUMN IF NOT EXISTS file_hash text;
CREATE INDEX IF NOT EXISTS idx_bank_vouchers_file_hash ON public.bank_vouchers(file_hash) WHERE file_hash IS NOT NULL;

ALTER TABLE public.cash_vouchers ADD COLUMN IF NOT EXISTS file_hash text;
CREATE INDEX IF NOT EXISTS idx_cash_vouchers_file_hash ON public.cash_vouchers(file_hash) WHERE file_hash IS NOT NULL;

-- 2. Soft-unique index for purchase invoices (tenant + supplier_tax_id + invoice_no)
CREATE UNIQUE INDEX IF NOT EXISTS uq_invoices_tenant_taxid_invoice_no
  ON public.invoices(tenant_id, supplier_tax_id, invoice_no)
  WHERE status <> 'void' AND supplier_tax_id IS NOT NULL AND invoice_no IS NOT NULL;

-- 3. Import batches table
CREATE TABLE IF NOT EXISTS public.import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid,
  user_id uuid NOT NULL,
  kind text NOT NULL,
  classification jsonb NOT NULL DEFAULT '[]'::jsonb,
  decisions jsonb,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_import_batches_user_created
  ON public.import_batches(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_import_batches_tenant_created
  ON public.import_batches(tenant_id, created_at DESC) WHERE tenant_id IS NOT NULL;

ALTER TABLE public.import_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own import_batches select" ON public.import_batches
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own import_batches insert" ON public.import_batches
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own import_batches update" ON public.import_batches
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "tenant import_batches select" ON public.import_batches
  FOR SELECT USING (tenant_id IS NOT NULL AND public.is_tenant_member(auth.uid(), tenant_id));

CREATE TRIGGER trg_import_batches_updated_at
  BEFORE UPDATE ON public.import_batches
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
