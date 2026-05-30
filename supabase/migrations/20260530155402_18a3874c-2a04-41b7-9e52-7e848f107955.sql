
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS tax_authority_code text,
  ADD COLUMN IF NOT EXISTS tax_authority_name text,
  ADD COLUMN IF NOT EXISTS province_code text,
  ADD COLUMN IF NOT EXISTS province_name text,
  ADD COLUMN IF NOT EXISTS district_code text,
  ADD COLUMN IF NOT EXISTS district_name text,
  ADD COLUMN IF NOT EXISTS ward_name text;
