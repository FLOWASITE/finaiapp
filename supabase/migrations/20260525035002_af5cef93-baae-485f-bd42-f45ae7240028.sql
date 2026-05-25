
-- 1) tenants config cho purpose detection
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS business_types text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS ccdc_allocation_threshold bigint NOT NULL DEFAULT 5000000,
  ADD COLUMN IF NOT EXISTS default_cost_center text NOT NULL DEFAULT '642';

ALTER TABLE public.tenants
  DROP CONSTRAINT IF EXISTS tenants_default_cost_center_check;
ALTER TABLE public.tenants
  ADD CONSTRAINT tenants_default_cost_center_check
  CHECK (default_cost_center IN ('627','641','642'));

-- 2) suppliers.role
ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS roles text[] NOT NULL DEFAULT '{}';

-- 3) tenant_product_catalog
CREATE TABLE IF NOT EXISTS public.tenant_product_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  sku text,
  name text NOT NULL,
  name_norm text NOT NULL,
  aliases text[] NOT NULL DEFAULT '{}',
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tenant_product_catalog_tenant_idx
  ON public.tenant_product_catalog (tenant_id);
CREATE INDEX IF NOT EXISTS tenant_product_catalog_name_norm_idx
  ON public.tenant_product_catalog (tenant_id, name_norm);
CREATE UNIQUE INDEX IF NOT EXISTS tenant_product_catalog_unique
  ON public.tenant_product_catalog (tenant_id, name_norm);

ALTER TABLE public.tenant_product_catalog ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view tenant catalog" ON public.tenant_product_catalog;
CREATE POLICY "Members can view tenant catalog"
  ON public.tenant_product_catalog FOR SELECT
  USING (public.is_tenant_member(auth.uid(), tenant_id));

DROP POLICY IF EXISTS "Members can insert tenant catalog" ON public.tenant_product_catalog;
CREATE POLICY "Members can insert tenant catalog"
  ON public.tenant_product_catalog FOR INSERT
  WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));

DROP POLICY IF EXISTS "Members can update tenant catalog" ON public.tenant_product_catalog;
CREATE POLICY "Members can update tenant catalog"
  ON public.tenant_product_catalog FOR UPDATE
  USING (public.is_tenant_member(auth.uid(), tenant_id));

DROP POLICY IF EXISTS "Members can delete tenant catalog" ON public.tenant_product_catalog;
CREATE POLICY "Members can delete tenant catalog"
  ON public.tenant_product_catalog FOR DELETE
  USING (public.is_tenant_member(auth.uid(), tenant_id));

DROP TRIGGER IF EXISTS trg_tpc_updated_at ON public.tenant_product_catalog;
CREATE TRIGGER trg_tpc_updated_at
  BEFORE UPDATE ON public.tenant_product_catalog
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4) ai_line_classifications.kind_v2
ALTER TABLE public.ai_line_classifications
  ADD COLUMN IF NOT EXISTS kind_v2 text;

ALTER TABLE public.ai_line_classifications
  DROP CONSTRAINT IF EXISTS ai_line_classifications_kind_check;
ALTER TABLE public.ai_line_classifications
  ADD CONSTRAINT ai_line_classifications_kind_check
  CHECK (kind IN (
    'goods','fixed_asset','ccdc','service',
    'service','raw_material','tools','prepaid',
    'goods_for_resale','fixed_asset_tangible','fixed_asset_intangible'
  ));

ALTER TABLE public.ai_line_classifications
  DROP CONSTRAINT IF EXISTS ai_line_classifications_kind_v2_check;
ALTER TABLE public.ai_line_classifications
  ADD CONSTRAINT ai_line_classifications_kind_v2_check
  CHECK (kind_v2 IS NULL OR kind_v2 IN (
    'service','raw_material','tools','prepaid',
    'goods_for_resale','fixed_asset_tangible','fixed_asset_intangible'
  ));
