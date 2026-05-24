ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS industries jsonb NOT NULL DEFAULT '[]'::jsonb;

UPDATE public.tenants
SET industries = jsonb_build_array(jsonb_build_object('code', industry_code, 'name', industry_name))
WHERE industries = '[]'::jsonb AND industry_code IS NOT NULL;