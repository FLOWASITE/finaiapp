-- 1) typeb_purpose_catalog table
CREATE TABLE public.typeb_purpose_catalog (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  name_en TEXT,
  group_code TEXT NOT NULL,
  account_tt99 TEXT NOT NULL,
  account_tt133 TEXT NOT NULL,
  line_kind TEXT NOT NULL DEFAULT 'service',
  needs_vat_output BOOLEAN NOT NULL DEFAULT false,
  cit_warning TEXT,
  cit_cap TEXT,
  aliases TEXT[] NOT NULL DEFAULT '{}',
  floating_goods TEXT[] NOT NULL DEFAULT '{}',
  legal_basis TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_typeb_active ON public.typeb_purpose_catalog(is_active, sort_order);
CREATE INDEX idx_typeb_group ON public.typeb_purpose_catalog(group_code);

GRANT SELECT ON public.typeb_purpose_catalog TO anon;
GRANT SELECT ON public.typeb_purpose_catalog TO authenticated;
GRANT ALL ON public.typeb_purpose_catalog TO service_role;

ALTER TABLE public.typeb_purpose_catalog ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read typeb catalog"
  ON public.typeb_purpose_catalog FOR SELECT
  USING (is_active = true);

CREATE TRIGGER update_typeb_purpose_catalog_updated_at
  BEFORE UPDATE ON public.typeb_purpose_catalog
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Add purpose_code to supplier_item_mappings (learning cache)
ALTER TABLE public.supplier_item_mappings
  ADD COLUMN IF NOT EXISTS purpose_code TEXT;

CREATE INDEX IF NOT EXISTS idx_sim_purpose_code
  ON public.supplier_item_mappings(purpose_code)
  WHERE purpose_code IS NOT NULL;