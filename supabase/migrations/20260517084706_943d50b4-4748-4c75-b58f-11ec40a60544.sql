
-- ============ ROLES ============
CREATE TYPE public.app_role AS ENUM ('owner', 'chief_accountant', 'accountant', 'viewer');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role) $$;

CREATE POLICY "view own roles" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "owner manage roles" ON public.user_roles FOR ALL
  USING (public.has_role(auth.uid(), 'owner'))
  WITH CHECK (public.has_role(auth.uid(), 'owner'));

-- Auto-grant 'owner' to user when profile is created (first login)
CREATE OR REPLACE FUNCTION public.grant_owner_role()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'owner')
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;
CREATE TRIGGER profiles_grant_owner AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.grant_owner_role();

-- Backfill existing users as owners
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'owner'::public.app_role FROM public.profiles ON CONFLICT DO NOTHING;

-- ============ PROFILE EXTENSIONS ============
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS bank_account text,
  ADD COLUMN IF NOT EXISTS logo_url text,
  ADD COLUMN IF NOT EXISTS signer_name text,
  ADD COLUMN IF NOT EXISTS fiscal_year_start int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS base_currency text NOT NULL DEFAULT 'VND';

-- ============ PAYROLL ============
CREATE TABLE public.employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  code text NOT NULL,
  full_name text NOT NULL,
  position text,
  department text,
  tax_id text,
  citizen_id text,
  bank_account text,
  base_salary numeric NOT NULL DEFAULT 0,
  insurance_salary numeric NOT NULL DEFAULT 0,
  dependents int NOT NULL DEFAULT 0,
  start_date date,
  end_date date,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own employees" ON public.employees FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.payroll_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  period_month date NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  total_gross numeric NOT NULL DEFAULT 0,
  total_net numeric NOT NULL DEFAULT 0,
  total_insurance_emp numeric NOT NULL DEFAULT 0,
  total_insurance_co numeric NOT NULL DEFAULT 0,
  total_pit numeric NOT NULL DEFAULT 0,
  journal_entry_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.payroll_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own payroll_runs" ON public.payroll_runs FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.payroll_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.payroll_runs(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL,
  base_salary numeric NOT NULL DEFAULT 0,
  allowance numeric NOT NULL DEFAULT 0,
  gross numeric NOT NULL DEFAULT 0,
  bhxh_emp numeric NOT NULL DEFAULT 0,
  bhyt_emp numeric NOT NULL DEFAULT 0,
  bhtn_emp numeric NOT NULL DEFAULT 0,
  bhxh_co numeric NOT NULL DEFAULT 0,
  bhyt_co numeric NOT NULL DEFAULT 0,
  bhtn_co numeric NOT NULL DEFAULT 0,
  taxable numeric NOT NULL DEFAULT 0,
  pit numeric NOT NULL DEFAULT 0,
  net numeric NOT NULL DEFAULT 0,
  dependents int NOT NULL DEFAULT 0
);
ALTER TABLE public.payroll_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own payroll_lines" ON public.payroll_lines FOR ALL
  USING (EXISTS (SELECT 1 FROM public.payroll_runs r WHERE r.id = run_id AND r.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.payroll_runs r WHERE r.id = run_id AND r.user_id = auth.uid()));

-- ============ PAYABLES ============
CREATE TABLE public.supplier_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  supplier_id uuid,
  supplier_name text,
  invoice_id uuid,
  pay_date date NOT NULL DEFAULT CURRENT_DATE,
  amount numeric NOT NULL,
  method text NOT NULL DEFAULT 'cash',
  reference text,
  journal_entry_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.supplier_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own supplier_payments" ON public.supplier_payments FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============ FX RATES ============
CREATE TABLE public.exchange_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  rate_date date NOT NULL,
  currency text NOT NULL,
  rate numeric NOT NULL,
  source text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, rate_date, currency)
);
ALTER TABLE public.exchange_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own fx" ON public.exchange_rates FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============ PERIOD LOCKS ============
CREATE TABLE public.period_locks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  year int NOT NULL,
  month int NOT NULL CHECK (month BETWEEN 1 AND 12),
  locked_at timestamptz NOT NULL DEFAULT now(),
  note text,
  UNIQUE(user_id, year, month)
);
ALTER TABLE public.period_locks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "view own locks" ON public.period_locks FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "owner manage locks" ON public.period_locks FOR ALL
  USING (auth.uid() = user_id AND public.has_role(auth.uid(), 'owner'))
  WITH CHECK (auth.uid() = user_id AND public.has_role(auth.uid(), 'owner'));

CREATE OR REPLACE FUNCTION public.is_period_locked(_user_id uuid, _date date)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.period_locks
    WHERE user_id = _user_id
      AND year = EXTRACT(YEAR FROM _date)::int
      AND month = EXTRACT(MONTH FROM _date)::int
  )
$$;
