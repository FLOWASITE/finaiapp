
CREATE TABLE public.fa_depreciation_books (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  post_to_gl BOOLEAN NOT NULL DEFAULT false,
  currency TEXT NOT NULL DEFAULT 'VND',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);
CREATE UNIQUE INDEX fa_dep_books_one_primary ON public.fa_depreciation_books (tenant_id) WHERE is_primary;
ALTER TABLE public.fa_depreciation_books ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant fa_dep_books select" ON public.fa_depreciation_books FOR SELECT
  USING (tenant_id IS NOT NULL AND is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "tenant fa_dep_books insert" ON public.fa_depreciation_books FOR INSERT
  WITH CHECK (tenant_id IS NOT NULL AND tenant_id = current_tenant_id() AND has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin','accountant']));
CREATE POLICY "tenant fa_dep_books update" ON public.fa_depreciation_books FOR UPDATE
  USING (tenant_id IS NOT NULL AND has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin','accountant']));
CREATE POLICY "tenant fa_dep_books delete" ON public.fa_depreciation_books FOR DELETE
  USING (tenant_id IS NOT NULL AND has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin','accountant']));
CREATE TRIGGER fa_dep_books_set_updated_at BEFORE UPDATE ON public.fa_depreciation_books
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.fa_asset_books (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  asset_id UUID NOT NULL REFERENCES public.fixed_assets(id) ON DELETE CASCADE,
  book_id UUID NOT NULL REFERENCES public.fa_depreciation_books(id) ON DELETE CASCADE,
  method TEXT NOT NULL DEFAULT 'straight_line',
  cost_basis NUMERIC,
  salvage_value NUMERIC NOT NULL DEFAULT 0,
  useful_life_months INTEGER NOT NULL,
  declining_factor NUMERIC NOT NULL DEFAULT 2,
  total_units NUMERIC,
  asset_account TEXT NOT NULL DEFAULT '211',
  accumulated_account TEXT NOT NULL DEFAULT '214',
  expense_account TEXT NOT NULL DEFAULT '6422',
  start_date DATE NOT NULL,
  opening_accumulated NUMERIC NOT NULL DEFAULT 0,
  opening_months INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  suspend_from DATE,
  suspend_to DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (asset_id, book_id)
);
CREATE INDEX idx_fa_asset_books_asset ON public.fa_asset_books (asset_id);
CREATE INDEX idx_fa_asset_books_book ON public.fa_asset_books (tenant_id, book_id);
ALTER TABLE public.fa_asset_books ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant fa_asset_books select" ON public.fa_asset_books FOR SELECT
  USING (tenant_id IS NOT NULL AND is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "tenant fa_asset_books insert" ON public.fa_asset_books FOR INSERT
  WITH CHECK (tenant_id IS NOT NULL AND tenant_id = current_tenant_id() AND has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin','accountant']));
CREATE POLICY "tenant fa_asset_books update" ON public.fa_asset_books FOR UPDATE
  USING (tenant_id IS NOT NULL AND has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin','accountant']));
CREATE POLICY "tenant fa_asset_books delete" ON public.fa_asset_books FOR DELETE
  USING (tenant_id IS NOT NULL AND has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin','accountant']));
CREATE TRIGGER fa_asset_books_set_updated_at BEFORE UPDATE ON public.fa_asset_books
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.depreciation_entries
  ADD COLUMN book_id UUID REFERENCES public.fa_depreciation_books(id) ON DELETE CASCADE,
  ADD COLUMN units NUMERIC;

INSERT INTO public.fa_depreciation_books (tenant_id, code, name, is_primary, post_to_gl)
SELECT DISTINCT tenant_id, 'ACCOUNTING', 'Sổ kế toán', true, true
FROM public.fixed_assets WHERE tenant_id IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO public.fa_depreciation_books (tenant_id, code, name, is_primary, post_to_gl)
SELECT DISTINCT tenant_id, 'TAX', 'Sổ thuế', false, false
FROM public.fixed_assets WHERE tenant_id IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO public.fa_asset_books (
  tenant_id, asset_id, book_id, method, cost_basis, salvage_value, useful_life_months,
  asset_account, accumulated_account, expense_account, start_date, opening_accumulated, opening_months, status
)
SELECT a.tenant_id, a.id, b.id, a.method, a.cost, a.salvage_value, a.useful_life_months,
       a.asset_account, a.accumulated_account, a.expense_account, a.start_date,
       a.opening_accumulated, a.opening_months,
       CASE WHEN a.status='suspended' THEN 'suspended' WHEN a.status='disposed' THEN 'closed' ELSE 'active' END
FROM public.fixed_assets a
JOIN public.fa_depreciation_books b ON b.tenant_id = a.tenant_id AND b.code='ACCOUNTING'
ON CONFLICT (asset_id, book_id) DO NOTHING;

UPDATE public.depreciation_entries de
SET book_id = b.id
FROM public.fixed_assets a
JOIN public.fa_depreciation_books b ON b.tenant_id = a.tenant_id AND b.code='ACCOUNTING'
WHERE de.asset_id = a.id AND de.book_id IS NULL;

ALTER TABLE public.depreciation_entries DROP CONSTRAINT IF EXISTS depreciation_entries_asset_id_period_month_key;
ALTER TABLE public.depreciation_entries
  ADD CONSTRAINT depreciation_entries_asset_book_period_key UNIQUE (asset_id, book_id, period_month);
CREATE INDEX IF NOT EXISTS idx_depreciation_entries_book ON public.depreciation_entries (book_id, period_month);

CREATE OR REPLACE FUNCTION public.ensure_asset_books()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  INSERT INTO public.fa_asset_books (
    tenant_id, asset_id, book_id, method, cost_basis, salvage_value, useful_life_months,
    asset_account, accumulated_account, expense_account, start_date,
    opening_accumulated, opening_months, status
  )
  SELECT NEW.tenant_id, NEW.id, b.id, NEW.method, NEW.cost, NEW.salvage_value, NEW.useful_life_months,
         NEW.asset_account, NEW.accumulated_account, NEW.expense_account, NEW.start_date,
         NEW.opening_accumulated, NEW.opening_months,
         CASE WHEN NEW.status='suspended' THEN 'suspended' WHEN NEW.status='disposed' THEN 'closed' ELSE 'active' END
  FROM public.fa_depreciation_books b WHERE b.tenant_id = NEW.tenant_id
  ON CONFLICT (asset_id, book_id) DO NOTHING;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_fixed_assets_ensure_books
  AFTER INSERT ON public.fixed_assets
  FOR EACH ROW EXECUTE FUNCTION public.ensure_asset_books();

CREATE OR REPLACE FUNCTION public.ensure_books_for_existing_assets()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  INSERT INTO public.fa_asset_books (
    tenant_id, asset_id, book_id, method, cost_basis, salvage_value, useful_life_months,
    asset_account, accumulated_account, expense_account, start_date,
    opening_accumulated, opening_months, status
  )
  SELECT a.tenant_id, a.id, NEW.id, a.method, a.cost, a.salvage_value, a.useful_life_months,
         a.asset_account, a.accumulated_account, a.expense_account, a.start_date,
         a.opening_accumulated, a.opening_months,
         CASE WHEN a.status='suspended' THEN 'suspended' WHEN a.status='disposed' THEN 'closed' ELSE 'active' END
  FROM public.fixed_assets a WHERE a.tenant_id = NEW.tenant_id
  ON CONFLICT (asset_id, book_id) DO NOTHING;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_fa_dep_books_seed_assets
  AFTER INSERT ON public.fa_depreciation_books
  FOR EACH ROW EXECUTE FUNCTION public.ensure_books_for_existing_assets();
