
-- Tenants: cấu hình VAT
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS vat_method text NOT NULL DEFAULT 'deduction',
  ADD COLUMN IF NOT EXISTS vat_declaration_freq text NOT NULL DEFAULT 'monthly';

ALTER TABLE public.tenants
  DROP CONSTRAINT IF EXISTS tenants_vat_method_chk;
ALTER TABLE public.tenants
  ADD CONSTRAINT tenants_vat_method_chk
  CHECK (vat_method IN ('deduction','direct_revenue','direct_value'));

ALTER TABLE public.tenants
  DROP CONSTRAINT IF EXISTS tenants_vat_freq_chk;
ALTER TABLE public.tenants
  ADD CONSTRAINT tenants_vat_freq_chk
  CHECK (vat_declaration_freq IN ('monthly','quarterly'));

-- ===== vat_filings =====
CREATE TABLE IF NOT EXISTS public.vat_filings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  period text NOT NULL,
  freq text NOT NULL CHECK (freq IN ('monthly','quarterly')),
  method text NOT NULL CHECK (method IN ('deduction','direct_revenue','direct_value')),
  snapshot jsonb NOT NULL,
  xml text,
  status text NOT NULL DEFAULT 'committed' CHECK (status IN ('draft','committed','submitted','reopened')),
  committed_by uuid,
  committed_at timestamptz DEFAULT now(),
  submitted_at timestamptz,
  ack_code text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vat_filings_user_period ON public.vat_filings(user_id, period);
CREATE INDEX IF NOT EXISTS idx_vat_filings_tenant_period ON public.vat_filings(tenant_id, period);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_vat_filings_active
  ON public.vat_filings(user_id, period)
  WHERE status IN ('committed','submitted');

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vat_filings TO authenticated;
GRANT ALL ON public.vat_filings TO service_role;

ALTER TABLE public.vat_filings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vat_filings_select_own" ON public.vat_filings
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "vat_filings_insert_own" ON public.vat_filings
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "vat_filings_update_own" ON public.vat_filings
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "vat_filings_delete_own" ON public.vat_filings
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER trg_vat_filings_updated_at
  BEFORE UPDATE ON public.vat_filings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ===== vat_filing_adjustments =====
CREATE TABLE IF NOT EXISTS public.vat_filing_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  filing_period text NOT NULL,
  original_period text NOT NULL,
  original_invoice_no text,
  kind text NOT NULL DEFAULT 'sales' CHECK (kind IN ('sales','purchase')),
  direction text NOT NULL CHECK (direction IN ('increase','decrease')),
  base_amount numeric NOT NULL DEFAULT 0,
  vat_amount numeric NOT NULL DEFAULT 0,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vat_adj_user_period ON public.vat_filing_adjustments(user_id, filing_period);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vat_filing_adjustments TO authenticated;
GRANT ALL ON public.vat_filing_adjustments TO service_role;

ALTER TABLE public.vat_filing_adjustments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vat_adj_select_own" ON public.vat_filing_adjustments
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "vat_adj_insert_own" ON public.vat_filing_adjustments
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "vat_adj_update_own" ON public.vat_filing_adjustments
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "vat_adj_delete_own" ON public.vat_filing_adjustments
  FOR DELETE TO authenticated USING (auth.uid() = user_id);
