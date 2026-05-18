
-- Phase D: payroll advances + payment workflow
CREATE TABLE IF NOT EXISTS public.payroll_advances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  period_month date NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  reason text,
  status text NOT NULL DEFAULT 'pending', -- pending | applied | cancelled
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payroll_advances_tenant ON public.payroll_advances(tenant_id);
CREATE INDEX IF NOT EXISTS idx_payroll_advances_emp_period ON public.payroll_advances(employee_id, period_month);

ALTER TABLE public.payroll_advances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant payroll_advances select" ON public.payroll_advances FOR SELECT
  USING (tenant_id IS NOT NULL AND is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "tenant payroll_advances insert" ON public.payroll_advances FOR INSERT
  WITH CHECK (tenant_id IS NOT NULL AND tenant_id = current_tenant_id() AND has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin','accountant']));
CREATE POLICY "tenant payroll_advances update" ON public.payroll_advances FOR UPDATE
  USING (tenant_id IS NOT NULL AND has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin','accountant']))
  WITH CHECK (tenant_id IS NOT NULL AND has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin','accountant']));
CREATE POLICY "tenant payroll_advances delete" ON public.payroll_advances FOR DELETE
  USING (tenant_id IS NOT NULL AND has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin','accountant']));

CREATE TRIGGER trg_payroll_advances_updated_at BEFORE UPDATE ON public.payroll_advances
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Payment tracking columns on payroll_runs
ALTER TABLE public.payroll_runs
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'unpaid', -- unpaid | paid
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS paid_reference text;

-- Add advance column to payroll_lines for visibility
ALTER TABLE public.payroll_lines
  ADD COLUMN IF NOT EXISTS advance numeric NOT NULL DEFAULT 0;
