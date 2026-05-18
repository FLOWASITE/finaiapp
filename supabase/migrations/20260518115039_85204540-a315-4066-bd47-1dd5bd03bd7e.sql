-- ============================================================
-- (D) Suppliers expansion + Fiscal periods
-- ============================================================

-- 1. SUPPLIERS — add columns
ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS country text DEFAULT 'VN',
  ADD COLUMN IF NOT EXISTS tax_office text,
  ADD COLUMN IF NOT EXISTS branch_tax_id text,
  ADD COLUMN IF NOT EXISTS default_expense_account text,
  ADD COLUMN IF NOT EXISTS default_vat_rate numeric,
  ADD COLUMN IF NOT EXISTS credit_limit numeric,
  ADD COLUMN IF NOT EXISTS blacklist_reason text,
  ADD COLUMN IF NOT EXISTS contact_phone2 text,
  ADD COLUMN IF NOT EXISTS contact_email2 text;

CREATE INDEX IF NOT EXISTS idx_suppliers_tenant_active ON public.suppliers (tenant_id, is_active);
CREATE INDEX IF NOT EXISTS idx_suppliers_tenant_name ON public.suppliers (tenant_id, name);

-- 2. FISCAL_YEARS
CREATE TABLE IF NOT EXISTS public.fiscal_years (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL,
  year int NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  closed_at timestamptz,
  closed_by uuid,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, year),
  CHECK (end_date > start_date)
);

ALTER TABLE public.fiscal_years ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own fiscal_years all" ON public.fiscal_years
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "tenant fiscal_years select" ON public.fiscal_years
  FOR SELECT USING (tenant_id IS NOT NULL AND is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "tenant fiscal_years insert" ON public.fiscal_years
  FOR INSERT WITH CHECK (tenant_id IS NOT NULL AND tenant_id = current_tenant_id()
    AND has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin']));
CREATE POLICY "tenant fiscal_years update" ON public.fiscal_years
  FOR UPDATE USING (tenant_id IS NOT NULL AND has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin']))
  WITH CHECK (tenant_id IS NOT NULL AND has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin']));
CREATE POLICY "tenant fiscal_years delete" ON public.fiscal_years
  FOR DELETE USING (tenant_id IS NOT NULL AND has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin']));

CREATE TRIGGER set_updated_at_fiscal_years BEFORE UPDATE ON public.fiscal_years
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER audit_fiscal_years AFTER INSERT OR UPDATE OR DELETE ON public.fiscal_years
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();

-- 3. FISCAL_PERIODS
CREATE TABLE IF NOT EXISTS public.fiscal_periods (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL,
  fiscal_year_id uuid NOT NULL REFERENCES public.fiscal_years(id) ON DELETE CASCADE,
  year int NOT NULL,
  period_no int NOT NULL CHECK (period_no BETWEEN 1 AND 12),
  start_date date NOT NULL,
  end_date date NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','soft_closed','closed')),
  closed_at timestamptz,
  closed_by uuid,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, year, period_no)
);

CREATE INDEX IF NOT EXISTS idx_fiscal_periods_tenant_status ON public.fiscal_periods (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_fiscal_periods_year_id ON public.fiscal_periods (fiscal_year_id);

ALTER TABLE public.fiscal_periods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own fiscal_periods all" ON public.fiscal_periods
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "tenant fiscal_periods select" ON public.fiscal_periods
  FOR SELECT USING (tenant_id IS NOT NULL AND is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "tenant fiscal_periods insert" ON public.fiscal_periods
  FOR INSERT WITH CHECK (tenant_id IS NOT NULL AND tenant_id = current_tenant_id()
    AND has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin']));
CREATE POLICY "tenant fiscal_periods update" ON public.fiscal_periods
  FOR UPDATE USING (tenant_id IS NOT NULL AND has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin']))
  WITH CHECK (tenant_id IS NOT NULL AND has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin']));
CREATE POLICY "tenant fiscal_periods delete" ON public.fiscal_periods
  FOR DELETE USING (tenant_id IS NOT NULL AND has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin']));

CREATE TRIGGER set_updated_at_fiscal_periods BEFORE UPDATE ON public.fiscal_periods
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER audit_fiscal_periods AFTER INSERT OR UPDATE OR DELETE ON public.fiscal_periods
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();

-- 4. RPC: generate_fiscal_year
CREATE OR REPLACE FUNCTION public.generate_fiscal_year(p_year int)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant uuid := current_tenant_id();
  v_user uuid := auth.uid();
  v_fy_id uuid;
  i int;
  v_start date;
  v_end date;
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Chưa chọn doanh nghiệp hoạt động';
  END IF;
  IF NOT has_tenant_role(v_user, v_tenant, ARRAY['owner','admin']) THEN
    RAISE EXCEPTION 'Chỉ chủ sở hữu / quản trị mới được tạo năm tài chính';
  END IF;
  IF p_year < 1900 OR p_year > 2200 THEN
    RAISE EXCEPTION 'Năm không hợp lệ';
  END IF;

  INSERT INTO public.fiscal_years (tenant_id, user_id, year, start_date, end_date, status)
  VALUES (v_tenant, v_user, p_year, make_date(p_year,1,1), make_date(p_year,12,31), 'open')
  RETURNING id INTO v_fy_id;

  FOR i IN 1..12 LOOP
    v_start := make_date(p_year, i, 1);
    v_end := (v_start + interval '1 month' - interval '1 day')::date;
    INSERT INTO public.fiscal_periods
      (tenant_id, user_id, fiscal_year_id, year, period_no, start_date, end_date, status)
    VALUES (v_tenant, v_user, v_fy_id, p_year, i, v_start, v_end, 'open');
  END LOOP;

  RETURN v_fy_id;
END $$;

-- 5. Replace is_period_locked to read from fiscal_periods
CREATE OR REPLACE FUNCTION public.is_period_locked(_user_id uuid, _date date)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.fiscal_periods fp
    JOIN public.profiles p ON p.active_tenant_id = fp.tenant_id
    WHERE p.id = _user_id
      AND fp.year = EXTRACT(YEAR FROM _date)::int
      AND fp.period_no = EXTRACT(MONTH FROM _date)::int
      AND fp.status IN ('soft_closed','closed')
  )
$$;

CREATE OR REPLACE FUNCTION public.is_period_hard_locked(_user_id uuid, _date date)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.fiscal_periods fp
    JOIN public.profiles p ON p.active_tenant_id = fp.tenant_id
    WHERE p.id = _user_id
      AND fp.year = EXTRACT(YEAR FROM _date)::int
      AND fp.period_no = EXTRACT(MONTH FROM _date)::int
      AND fp.status = 'closed'
  )
$$;

-- 6. Drop legacy period_locks
DROP TRIGGER IF EXISTS audit_period_locks ON public.period_locks;
DROP TABLE IF EXISTS public.period_locks;