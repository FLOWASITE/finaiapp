ALTER TABLE public.tenants
ADD COLUMN IF NOT EXISTS fiscal_year_start_day smallint NOT NULL DEFAULT 1
CHECK (fiscal_year_start_day BETWEEN 1 AND 31);