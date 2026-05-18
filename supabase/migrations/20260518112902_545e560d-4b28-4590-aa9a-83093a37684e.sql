
-- =========================================================
-- 1) CATALOG TABLES
-- =========================================================

CREATE TABLE public.branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  address text,
  tax_id text,
  phone text,
  manager text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);

CREATE TABLE public.departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  parent_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  manager text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);

CREATE TABLE public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  description text,
  customer_id uuid,
  manager_employee_id uuid,
  start_date date,
  end_date date,
  status text NOT NULL DEFAULT 'active',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);

CREATE TABLE public.cost_centers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  parent_id uuid REFERENCES public.cost_centers(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);

-- Enable RLS
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cost_centers ENABLE ROW LEVEL SECURITY;

-- Policies (copy of pattern used elsewhere)
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['branches','departments','projects','cost_centers'] LOOP
    EXECUTE format($f$
      CREATE POLICY "own %1$s all" ON public.%1$I
        FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
      CREATE POLICY "tenant %1$s select" ON public.%1$I
        FOR SELECT USING (tenant_id IS NOT NULL AND is_tenant_member(auth.uid(), tenant_id));
      CREATE POLICY "tenant %1$s insert" ON public.%1$I
        FOR INSERT WITH CHECK (
          tenant_id IS NOT NULL
          AND tenant_id = current_tenant_id()
          AND has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin','accountant'])
        );
      CREATE POLICY "tenant %1$s update" ON public.%1$I
        FOR UPDATE USING (
          tenant_id IS NOT NULL
          AND has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin','accountant'])
        ) WITH CHECK (
          tenant_id IS NOT NULL
          AND has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin','accountant'])
        );
      CREATE POLICY "tenant %1$s delete" ON public.%1$I
        FOR DELETE USING (
          tenant_id IS NOT NULL
          AND has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin','accountant'])
        );
    $f$, t);
  END LOOP;
END $$;

-- updated_at triggers
CREATE TRIGGER trg_branches_updated_at BEFORE UPDATE ON public.branches
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_departments_updated_at BEFORE UPDATE ON public.departments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_projects_updated_at BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_cost_centers_updated_at BEFORE UPDATE ON public.cost_centers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Indexes
CREATE INDEX idx_branches_tenant ON public.branches(tenant_id);
CREATE INDEX idx_departments_tenant ON public.departments(tenant_id);
CREATE INDEX idx_departments_branch ON public.departments(branch_id);
CREATE INDEX idx_projects_tenant ON public.projects(tenant_id);
CREATE INDEX idx_cost_centers_tenant ON public.cost_centers(tenant_id);

-- =========================================================
-- 2) ADD DIMENSION COLUMNS TO BUSINESS TABLES
-- =========================================================

-- invoices (purchase)
ALTER TABLE public.invoices
  ADD COLUMN branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  ADD COLUMN department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  ADD COLUMN project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  ADD COLUMN cost_center_id uuid REFERENCES public.cost_centers(id) ON DELETE SET NULL;
CREATE INDEX idx_invoices_branch ON public.invoices(tenant_id, branch_id);
CREATE INDEX idx_invoices_project ON public.invoices(tenant_id, project_id);

-- sales_invoices
ALTER TABLE public.sales_invoices
  ADD COLUMN branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  ADD COLUMN department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  ADD COLUMN project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  ADD COLUMN cost_center_id uuid REFERENCES public.cost_centers(id) ON DELETE SET NULL;
CREATE INDEX idx_sales_invoices_branch ON public.sales_invoices(tenant_id, branch_id);
CREATE INDEX idx_sales_invoices_project ON public.sales_invoices(tenant_id, project_id);

-- einvoices
ALTER TABLE public.einvoices
  ADD COLUMN branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  ADD COLUMN department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  ADD COLUMN project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  ADD COLUMN cost_center_id uuid REFERENCES public.cost_centers(id) ON DELETE SET NULL;
CREATE INDEX idx_einvoices_branch ON public.einvoices(tenant_id, branch_id);
CREATE INDEX idx_einvoices_project ON public.einvoices(tenant_id, project_id);

-- cash_vouchers
ALTER TABLE public.cash_vouchers
  ADD COLUMN branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  ADD COLUMN project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  ADD COLUMN cost_center_id uuid REFERENCES public.cost_centers(id) ON DELETE SET NULL;
CREATE INDEX idx_cash_vouchers_branch ON public.cash_vouchers(tenant_id, branch_id);

-- bank_vouchers
ALTER TABLE public.bank_vouchers
  ADD COLUMN branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  ADD COLUMN project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  ADD COLUMN cost_center_id uuid REFERENCES public.cost_centers(id) ON DELETE SET NULL;
CREATE INDEX idx_bank_vouchers_branch ON public.bank_vouchers(tenant_id, branch_id);

-- customer_receipts
ALTER TABLE public.customer_receipts
  ADD COLUMN branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  ADD COLUMN project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  ADD COLUMN cost_center_id uuid REFERENCES public.cost_centers(id) ON DELETE SET NULL;

-- supplier_payments (exists per trigger)
ALTER TABLE public.supplier_payments
  ADD COLUMN branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  ADD COLUMN project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  ADD COLUMN cost_center_id uuid REFERENCES public.cost_centers(id) ON DELETE SET NULL;

-- fixed_assets
ALTER TABLE public.fixed_assets
  ADD COLUMN branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  ADD COLUMN department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL;

-- employees
ALTER TABLE public.employees
  ADD COLUMN branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  ADD COLUMN department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL;

-- payroll_runs
ALTER TABLE public.payroll_runs
  ADD COLUMN branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  ADD COLUMN department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL;

-- bank_transactions
ALTER TABLE public.bank_transactions
  ADD COLUMN branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL;

-- journal_entries
ALTER TABLE public.journal_entries
  ADD COLUMN branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  ADD COLUMN project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  ADD COLUMN cost_center_id uuid REFERENCES public.cost_centers(id) ON DELETE SET NULL;
CREATE INDEX idx_journal_entries_branch ON public.journal_entries(tenant_id, branch_id);
CREATE INDEX idx_journal_entries_project ON public.journal_entries(tenant_id, project_id);

-- journal_lines (allow per-line split)
ALTER TABLE public.journal_lines
  ADD COLUMN branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  ADD COLUMN department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  ADD COLUMN project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  ADD COLUMN cost_center_id uuid REFERENCES public.cost_centers(id) ON DELETE SET NULL;
CREATE INDEX idx_journal_lines_project ON public.journal_lines(project_id);
CREATE INDEX idx_journal_lines_branch ON public.journal_lines(branch_id);

-- =========================================================
-- 3) CROSS-TENANT GUARD TRIGGER
-- =========================================================

CREATE OR REPLACE FUNCTION public.assert_dim_same_tenant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid;
  v_dim_tenant uuid;
BEGIN
  v_tenant := NEW.tenant_id;
  IF v_tenant IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.branch_id IS NOT NULL THEN
    SELECT tenant_id INTO v_dim_tenant FROM public.branches WHERE id = NEW.branch_id;
    IF v_dim_tenant IS DISTINCT FROM v_tenant THEN
      RAISE EXCEPTION 'branch_id thuộc doanh nghiệp khác';
    END IF;
  END IF;

  IF to_jsonb(NEW) ? 'department_id' AND (to_jsonb(NEW)->>'department_id') IS NOT NULL THEN
    SELECT tenant_id INTO v_dim_tenant FROM public.departments
      WHERE id = (to_jsonb(NEW)->>'department_id')::uuid;
    IF v_dim_tenant IS DISTINCT FROM v_tenant THEN
      RAISE EXCEPTION 'department_id thuộc doanh nghiệp khác';
    END IF;
  END IF;

  IF to_jsonb(NEW) ? 'project_id' AND (to_jsonb(NEW)->>'project_id') IS NOT NULL THEN
    SELECT tenant_id INTO v_dim_tenant FROM public.projects
      WHERE id = (to_jsonb(NEW)->>'project_id')::uuid;
    IF v_dim_tenant IS DISTINCT FROM v_tenant THEN
      RAISE EXCEPTION 'project_id thuộc doanh nghiệp khác';
    END IF;
  END IF;

  IF to_jsonb(NEW) ? 'cost_center_id' AND (to_jsonb(NEW)->>'cost_center_id') IS NOT NULL THEN
    SELECT tenant_id INTO v_dim_tenant FROM public.cost_centers
      WHERE id = (to_jsonb(NEW)->>'cost_center_id')::uuid;
    IF v_dim_tenant IS DISTINCT FROM v_tenant THEN
      RAISE EXCEPTION 'cost_center_id thuộc doanh nghiệp khác';
    END IF;
  END IF;

  RETURN NEW;
END $$;

-- Attach guard to tables that have tenant_id + at least one dim column
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'invoices','sales_invoices','einvoices',
    'cash_vouchers','bank_vouchers','customer_receipts','supplier_payments',
    'fixed_assets','employees','payroll_runs','bank_transactions',
    'journal_entries'
  ] LOOP
    EXECUTE format($f$
      CREATE TRIGGER trg_%1$s_dim_tenant_guard
        BEFORE INSERT OR UPDATE ON public.%1$I
        FOR EACH ROW EXECUTE FUNCTION public.assert_dim_same_tenant();
    $f$, t);
  END LOOP;
END $$;

-- For journal_lines we need a special trigger because it has no tenant_id column;
-- inherit tenant from parent journal_entries.
CREATE OR REPLACE FUNCTION public.assert_journal_line_dim_same_tenant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid;
  v_dim_tenant uuid;
BEGIN
  SELECT tenant_id INTO v_tenant FROM public.journal_entries WHERE id = NEW.entry_id;
  IF v_tenant IS NULL THEN RETURN NEW; END IF;

  IF NEW.branch_id IS NOT NULL THEN
    SELECT tenant_id INTO v_dim_tenant FROM public.branches WHERE id = NEW.branch_id;
    IF v_dim_tenant IS DISTINCT FROM v_tenant THEN
      RAISE EXCEPTION 'branch_id thuộc doanh nghiệp khác';
    END IF;
  END IF;
  IF NEW.department_id IS NOT NULL THEN
    SELECT tenant_id INTO v_dim_tenant FROM public.departments WHERE id = NEW.department_id;
    IF v_dim_tenant IS DISTINCT FROM v_tenant THEN
      RAISE EXCEPTION 'department_id thuộc doanh nghiệp khác';
    END IF;
  END IF;
  IF NEW.project_id IS NOT NULL THEN
    SELECT tenant_id INTO v_dim_tenant FROM public.projects WHERE id = NEW.project_id;
    IF v_dim_tenant IS DISTINCT FROM v_tenant THEN
      RAISE EXCEPTION 'project_id thuộc doanh nghiệp khác';
    END IF;
  END IF;
  IF NEW.cost_center_id IS NOT NULL THEN
    SELECT tenant_id INTO v_dim_tenant FROM public.cost_centers WHERE id = NEW.cost_center_id;
    IF v_dim_tenant IS DISTINCT FROM v_tenant THEN
      RAISE EXCEPTION 'cost_center_id thuộc doanh nghiệp khác';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_journal_lines_dim_tenant_guard
  BEFORE INSERT OR UPDATE ON public.journal_lines
  FOR EACH ROW EXECUTE FUNCTION public.assert_journal_line_dim_same_tenant();

-- =========================================================
-- 4) USER DEFAULTS ON profiles
-- =========================================================

ALTER TABLE public.profiles
  ADD COLUMN default_branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  ADD COLUMN default_department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  ADD COLUMN default_project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL;
