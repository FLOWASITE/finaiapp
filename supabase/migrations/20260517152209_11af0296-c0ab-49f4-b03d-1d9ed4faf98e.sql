ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS trade_name text,
  ADD COLUMN IF NOT EXISTS legal_form text,
  ADD COLUMN IF NOT EXISTS business_reg_no text,
  ADD COLUMN IF NOT EXISTS business_reg_date date,
  ADD COLUMN IF NOT EXISTS business_reg_place text,
  ADD COLUMN IF NOT EXISTS established_date date,
  ADD COLUMN IF NOT EXISTS industry_code text,
  ADD COLUMN IF NOT EXISTS industry_name text,
  ADD COLUMN IF NOT EXISTS tax_authority text,
  ADD COLUMN IF NOT EXISTS tax_method text,
  ADD COLUMN IF NOT EXISTS vat_period text,
  ADD COLUMN IF NOT EXISTS pit_period text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS website text,
  ADD COLUMN IF NOT EXISTS fax text,
  ADD COLUMN IF NOT EXISTS billing_address text,
  ADD COLUMN IF NOT EXISTS shipping_address text,
  ADD COLUMN IF NOT EXISTS legal_rep_title text,
  ADD COLUMN IF NOT EXISTS legal_rep_id_no text,
  ADD COLUMN IF NOT EXISTS legal_rep_id_date date,
  ADD COLUMN IF NOT EXISTS legal_rep_phone text,
  ADD COLUMN IF NOT EXISTS chief_accountant_cert_no text,
  ADD COLUMN IF NOT EXISTS setup_completed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS setup_completed_at timestamptz;

DO $$ BEGIN
  ALTER TABLE public.tenants
    ADD CONSTRAINT tenants_legal_form_check
    CHECK (legal_form IS NULL OR legal_form IN ('llc','jsc','partnership','sole_prop','household','branch','other'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.tenants
    ADD CONSTRAINT tenants_tax_method_check
    CHECK (tax_method IS NULL OR tax_method IN ('deduction','direct_revenue','direct_gtgt'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.tenants
    ADD CONSTRAINT tenants_vat_period_check
    CHECK (vat_period IS NULL OR vat_period IN ('monthly','quarterly'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.tenants
    ADD CONSTRAINT tenants_pit_period_check
    CHECK (pit_period IS NULL OR pit_period IN ('monthly','quarterly'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION public.tenants_validate_dates()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.business_reg_date IS NOT NULL AND NEW.business_reg_date > CURRENT_DATE THEN
    RAISE EXCEPTION 'business_reg_date không được nằm trong tương lai';
  END IF;
  IF NEW.established_date IS NOT NULL AND NEW.established_date > CURRENT_DATE THEN
    RAISE EXCEPTION 'established_date không được nằm trong tương lai';
  END IF;
  IF NEW.legal_rep_id_date IS NOT NULL AND NEW.legal_rep_id_date > CURRENT_DATE THEN
    RAISE EXCEPTION 'legal_rep_id_date không được nằm trong tương lai';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tenants_validate_dates_trg ON public.tenants;
CREATE TRIGGER tenants_validate_dates_trg
  BEFORE INSERT OR UPDATE ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.tenants_validate_dates();