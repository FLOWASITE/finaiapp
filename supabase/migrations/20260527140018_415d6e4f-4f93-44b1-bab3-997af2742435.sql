ALTER TABLE public.tenant_product_catalog
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS subcategory text,
  ADD COLUMN IF NOT EXISTS item_type text,
  ADD COLUMN IF NOT EXISTS default_account text,
  ADD COLUMN IF NOT EXISTS vat_rate numeric;

CREATE INDEX IF NOT EXISTS idx_tpc_category_global
  ON public.tenant_product_catalog(category)
  WHERE is_global = true;