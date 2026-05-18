
-- Extend employees
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS dob date,
  ADD COLUMN IF NOT EXISTS gender text,
  ADD COLUMN IF NOT EXISTS ethnicity text,
  ADD COLUMN IF NOT EXISTS nationality text DEFAULT 'Việt Nam',
  ADD COLUMN IF NOT EXISTS citizen_id_date date,
  ADD COLUMN IF NOT EXISTS citizen_id_place text,
  ADD COLUMN IF NOT EXISTS tax_id_date date,
  ADD COLUMN IF NOT EXISTS social_insurance_no text,
  ADD COLUMN IF NOT EXISTS health_insurance_no text,
  ADD COLUMN IF NOT EXISTS contract_type text,
  ADD COLUMN IF NOT EXISTS contract_no text,
  ADD COLUMN IF NOT EXISTS hire_date date,
  ADD COLUMN IF NOT EXISTS probation_end date,
  ADD COLUMN IF NOT EXISTS termination_date date,
  ADD COLUMN IF NOT EXISTS payment_method text DEFAULT 'bank',
  ADD COLUMN IF NOT EXISTS bank_name text,
  ADD COLUMN IF NOT EXISTS bank_branch text,
  ADD COLUMN IF NOT EXISTS region int DEFAULT 1,
  ADD COLUMN IF NOT EXISTS is_resident boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DROP TRIGGER IF EXISTS set_employees_updated_at ON public.employees;
CREATE TRIGGER set_employees_updated_at BEFORE UPDATE ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Contracts
CREATE TABLE IF NOT EXISTS public.employee_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  contract_no text NOT NULL,
  contract_type text NOT NULL DEFAULT 'definite', -- probation/definite/indefinite/seasonal/service
  start_date date NOT NULL,
  end_date date,
  base_salary numeric NOT NULL DEFAULT 0,
  insurance_salary numeric NOT NULL DEFAULT 0,
  fixed_allowance numeric NOT NULL DEFAULT 0,
  attachment_url text,
  status text NOT NULL DEFAULT 'active', -- active/expired/terminated
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_emp_contracts_tenant ON public.employee_contracts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_emp_contracts_emp ON public.employee_contracts(employee_id);
ALTER TABLE public.employee_contracts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant emp_contracts select" ON public.employee_contracts FOR SELECT
  USING (tenant_id IS NOT NULL AND is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "tenant emp_contracts insert" ON public.employee_contracts FOR INSERT
  WITH CHECK (tenant_id = current_tenant_id() AND has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin','accountant','hr']));
CREATE POLICY "tenant emp_contracts update" ON public.employee_contracts FOR UPDATE
  USING (has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin','accountant','hr']))
  WITH CHECK (has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin','accountant','hr']));
CREATE POLICY "tenant emp_contracts delete" ON public.employee_contracts FOR DELETE
  USING (has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin','accountant','hr']));

CREATE TRIGGER set_emp_contracts_updated_at BEFORE UPDATE ON public.employee_contracts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Dependents
CREATE TABLE IF NOT EXISTS public.employee_dependents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  relationship text NOT NULL, -- con/cha/mẹ/...
  dob date,
  tax_id text,
  citizen_id text,
  deduction_start date NOT NULL,
  deduction_end date,
  registration_status text NOT NULL DEFAULT 'registered', -- registered/pending/cancelled
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_emp_deps_tenant ON public.employee_dependents(tenant_id);
CREATE INDEX IF NOT EXISTS idx_emp_deps_emp ON public.employee_dependents(employee_id);
ALTER TABLE public.employee_dependents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant emp_deps select" ON public.employee_dependents FOR SELECT
  USING (tenant_id IS NOT NULL AND is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "tenant emp_deps insert" ON public.employee_dependents FOR INSERT
  WITH CHECK (tenant_id = current_tenant_id() AND has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin','accountant','hr']));
CREATE POLICY "tenant emp_deps update" ON public.employee_dependents FOR UPDATE
  USING (has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin','accountant','hr']))
  WITH CHECK (has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin','accountant','hr']));
CREATE POLICY "tenant emp_deps delete" ON public.employee_dependents FOR DELETE
  USING (has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin','accountant','hr']));

CREATE TRIGGER set_emp_deps_updated_at BEFORE UPDATE ON public.employee_dependents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Payroll policies (per tenant, per year)
CREATE TABLE IF NOT EXISTS public.payroll_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  year int NOT NULL,
  bhxh_emp_rate numeric NOT NULL DEFAULT 0.08,
  bhyt_emp_rate numeric NOT NULL DEFAULT 0.015,
  bhtn_emp_rate numeric NOT NULL DEFAULT 0.01,
  bhxh_co_rate  numeric NOT NULL DEFAULT 0.175,
  bhyt_co_rate  numeric NOT NULL DEFAULT 0.03,
  bhtn_co_rate  numeric NOT NULL DEFAULT 0.01,
  union_co_rate numeric NOT NULL DEFAULT 0.02,
  personal_deduction numeric NOT NULL DEFAULT 11000000,
  dependent_deduction numeric NOT NULL DEFAULT 4400000,
  bh_cap_salary numeric NOT NULL DEFAULT 46800000, -- 20 × min wage region I (2024)
  unemployment_cap_region1 numeric NOT NULL DEFAULT 99200000, -- 20 × region 1
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, year)
);
ALTER TABLE public.payroll_policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant payroll_policies select" ON public.payroll_policies FOR SELECT
  USING (tenant_id IS NOT NULL AND is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "tenant payroll_policies insert" ON public.payroll_policies FOR INSERT
  WITH CHECK (tenant_id = current_tenant_id() AND has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin','accountant']));
CREATE POLICY "tenant payroll_policies update" ON public.payroll_policies FOR UPDATE
  USING (has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin','accountant']))
  WITH CHECK (has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin','accountant']));
CREATE POLICY "tenant payroll_policies delete" ON public.payroll_policies FOR DELETE
  USING (has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin','accountant']));

CREATE TRIGGER set_payroll_policies_updated_at BEFORE UPDATE ON public.payroll_policies
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Audit triggers
CREATE TRIGGER audit_employee_contracts AFTER INSERT OR UPDATE OR DELETE ON public.employee_contracts
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();
CREATE TRIGGER audit_employee_dependents AFTER INSERT OR UPDATE OR DELETE ON public.employee_dependents
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();
CREATE TRIGGER audit_payroll_policies AFTER INSERT OR UPDATE OR DELETE ON public.payroll_policies
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();
