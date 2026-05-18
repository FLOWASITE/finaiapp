CREATE TABLE IF NOT EXISTS public.salary_components (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'earning',
  is_taxable boolean NOT NULL DEFAULT true,
  taxable_threshold numeric(18,2) NOT NULL DEFAULT 0,
  is_insurable boolean NOT NULL DEFAULT false,
  ot_multiplier numeric(6,3) NOT NULL DEFAULT 1.0,
  expense_account text,
  is_fixed boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);
ALTER TABLE public.salary_components ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant members read salary_components" ON public.salary_components FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()));
CREATE POLICY "tenant members write salary_components" ON public.salary_components FOR ALL TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()))
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()));
CREATE TRIGGER trg_salary_components_updated_at BEFORE UPDATE ON public.salary_components
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.employee_salary_structures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  component_id uuid NOT NULL REFERENCES public.salary_components(id) ON DELETE RESTRICT,
  amount numeric(18,2) NOT NULL DEFAULT 0,
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  effective_to date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ess_emp ON public.employee_salary_structures(employee_id);
ALTER TABLE public.employee_salary_structures ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant members read ess" ON public.employee_salary_structures FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()));
CREATE POLICY "tenant members write ess" ON public.employee_salary_structures FOR ALL TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()))
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()));
CREATE TRIGGER trg_ess_updated_at BEFORE UPDATE ON public.employee_salary_structures
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.timesheets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  period_month text NOT NULL,
  standard_days numeric(6,2) NOT NULL DEFAULT 22,
  actual_days numeric(6,2) NOT NULL DEFAULT 22,
  paid_leave_days numeric(6,2) NOT NULL DEFAULT 0,
  unpaid_leave_days numeric(6,2) NOT NULL DEFAULT 0,
  ot_150_hours numeric(8,2) NOT NULL DEFAULT 0,
  ot_200_hours numeric(8,2) NOT NULL DEFAULT 0,
  ot_300_hours numeric(8,2) NOT NULL DEFAULT 0,
  night_hours numeric(8,2) NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, employee_id, period_month)
);
CREATE INDEX IF NOT EXISTS idx_timesheets_period ON public.timesheets(tenant_id, period_month);
ALTER TABLE public.timesheets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant members read timesheets" ON public.timesheets FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()));
CREATE POLICY "tenant members write timesheets" ON public.timesheets FOR ALL TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()))
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()));
CREATE TRIGGER trg_timesheets_updated_at BEFORE UPDATE ON public.timesheets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.payroll_run_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  run_id uuid NOT NULL REFERENCES public.payroll_runs(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  component_id uuid REFERENCES public.salary_components(id),
  component_code text,
  component_name text,
  kind text,
  amount numeric(18,2) NOT NULL DEFAULT 0,
  taxable_amount numeric(18,2) NOT NULL DEFAULT 0,
  insurable_amount numeric(18,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_prl_run ON public.payroll_run_lines(run_id);
CREATE INDEX IF NOT EXISTS idx_prl_emp ON public.payroll_run_lines(employee_id);
ALTER TABLE public.payroll_run_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant members read prl" ON public.payroll_run_lines FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()));
CREATE POLICY "tenant members write prl" ON public.payroll_run_lines FOR ALL TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()))
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()));

INSERT INTO public.salary_components (tenant_id, code, name, kind, is_taxable, taxable_threshold, is_insurable, ot_multiplier, expense_account, is_fixed, sort_order)
SELECT t.id, x.code, x.name, x.kind, x.is_taxable, x.taxable_threshold, x.is_insurable, x.ot_multiplier, x.expense_account, x.is_fixed, x.sort_order
FROM public.tenants t
CROSS JOIN (VALUES
  ('BASIC',   'Lương cơ bản',          'earning',   true,  0::numeric,         true,  1.0::numeric, '6421', true,  10),
  ('LUNCH',   'Phụ cấp ăn trưa',       'allowance', true,  730000::numeric,    false, 1.0::numeric, '6421', true,  20),
  ('PHONE',   'Phụ cấp điện thoại',    'allowance', false, 0::numeric,         false, 1.0::numeric, '6421', true,  30),
  ('TRAVEL',  'Phụ cấp đi lại',        'allowance', true,  0::numeric,         false, 1.0::numeric, '6421', true,  40),
  ('RESP',    'Phụ cấp trách nhiệm',   'allowance', true,  0::numeric,         true,  1.0::numeric, '6421', true,  50),
  ('BONUS',   'Thưởng',                'bonus',     true,  0::numeric,         false, 1.0::numeric, '6421', true,  60),
  ('OT150',   'Tăng ca ngày thường',   'overtime',  true,  0::numeric,         false, 1.5::numeric, '6421', false, 70),
  ('OT200',   'Tăng ca ngày nghỉ',     'overtime',  true,  0::numeric,         false, 2.0::numeric, '6421', false, 80),
  ('OT300',   'Tăng ca ngày lễ',       'overtime',  true,  0::numeric,         false, 3.0::numeric, '6421', false, 90),
  ('DEDUCT',  'Khấu trừ khác',         'deduction', false, 0::numeric,         false, 1.0::numeric, '334',  true,  100)
) AS x(code, name, kind, is_taxable, taxable_threshold, is_insurable, ot_multiplier, expense_account, is_fixed, sort_order)
ON CONFLICT (tenant_id, code) DO NOTHING;