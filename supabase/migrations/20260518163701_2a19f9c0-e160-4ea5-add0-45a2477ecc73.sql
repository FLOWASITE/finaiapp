
-- Phase A: Hoàn thiện hồ sơ Tài sản cố định

-- 1) Bảng danh mục TSCĐ (theo TT45/2013)
CREATE TABLE IF NOT EXISTS public.fa_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  code text NOT NULL,
  name text NOT NULL,
  parent_id uuid REFERENCES public.fa_categories(id) ON DELETE SET NULL,
  -- Khung khấu hao mặc định (năm)
  default_useful_life_years_min int,
  default_useful_life_years_max int,
  default_useful_life_months int,
  default_method text NOT NULL DEFAULT 'straight_line',
  -- TK mặc định
  default_asset_account text NOT NULL DEFAULT '211',
  default_accumulated_account text NOT NULL DEFAULT '214',
  default_expense_account text NOT NULL DEFAULT '6422',
  -- Loại TSCĐ: tangible (hữu hình) | intangible (vô hình)
  asset_kind text NOT NULL DEFAULT 'tangible',
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);

ALTER TABLE public.fa_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant fa_categories select" ON public.fa_categories
  FOR SELECT USING (tenant_id IS NOT NULL AND public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "tenant fa_categories insert" ON public.fa_categories
  FOR INSERT WITH CHECK (tenant_id IS NOT NULL AND tenant_id = public.current_tenant_id()
    AND public.has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin','accountant']));
CREATE POLICY "tenant fa_categories update" ON public.fa_categories
  FOR UPDATE USING (tenant_id IS NOT NULL AND public.has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin','accountant']));
CREATE POLICY "tenant fa_categories delete" ON public.fa_categories
  FOR DELETE USING (tenant_id IS NOT NULL AND public.has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin','accountant']));

CREATE INDEX IF NOT EXISTS idx_fa_categories_tenant ON public.fa_categories(tenant_id);
CREATE TRIGGER fa_categories_set_updated_at BEFORE UPDATE ON public.fa_categories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2) Mở rộng bảng fixed_assets
ALTER TABLE public.fixed_assets
  ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES public.fa_categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS asset_kind text NOT NULL DEFAULT 'tangible',
  ADD COLUMN IF NOT EXISTS supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cost_center_id uuid REFERENCES public.cost_centers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assignee_id uuid,
  ADD COLUMN IF NOT EXISTS serial_no text,
  ADD COLUMN IF NOT EXISTS model text,
  ADD COLUMN IF NOT EXISTS manufacturer text,
  ADD COLUMN IF NOT EXISTS origin_country text,
  ADD COLUMN IF NOT EXISTS mfg_year int,
  ADD COLUMN IF NOT EXISTS location text,
  ADD COLUMN IF NOT EXISTS quantity numeric NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS unit text,
  ADD COLUMN IF NOT EXISTS acquired_date date,
  ADD COLUMN IF NOT EXISTS in_service_date date,
  ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS source_doc_table text,
  ADD COLUMN IF NOT EXISTS source_doc_id uuid,
  ADD COLUMN IF NOT EXISTS funding_source text,
  ADD COLUMN IF NOT EXISTS opening_accumulated numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS opening_months int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS image_url text,
  ADD COLUMN IF NOT EXISTS attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_fixed_assets_category ON public.fixed_assets(category_id);
CREATE INDEX IF NOT EXISTS idx_fixed_assets_supplier ON public.fixed_assets(supplier_id);
CREATE INDEX IF NOT EXISTS idx_fixed_assets_source ON public.fixed_assets(source_doc_table, source_doc_id);
CREATE INDEX IF NOT EXISTS idx_fixed_assets_status ON public.fixed_assets(tenant_id, status);

DROP TRIGGER IF EXISTS fixed_assets_set_updated_at ON public.fixed_assets;
CREATE TRIGGER fixed_assets_set_updated_at BEFORE UPDATE ON public.fixed_assets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Validate tenant của các dimension
DROP TRIGGER IF EXISTS fixed_assets_assert_dim ON public.fixed_assets;
CREATE TRIGGER fixed_assets_assert_dim BEFORE INSERT OR UPDATE ON public.fixed_assets
  FOR EACH ROW EXECUTE FUNCTION public.assert_dim_same_tenant();
