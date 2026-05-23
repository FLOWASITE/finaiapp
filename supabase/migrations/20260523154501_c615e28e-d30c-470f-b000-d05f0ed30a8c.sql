
-- ============ ENUMs ============
DO $$ BEGIN
  CREATE TYPE public.office_prospect_status AS ENUM ('new','contacted','negotiating','won','lost');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.office_link_status AS ENUM ('active','paused','terminated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.office_contract_status AS ENUM ('draft','active','expired','terminated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.office_billing_cycle AS ENUM ('monthly','quarterly','yearly','one_off');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.office_task_status AS ENUM ('todo','in_progress','review','done','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.office_task_priority AS ENUM ('low','med','high','urgent');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.office_task_category AS ENUM (
    'vat_filing','pit','cit','social_insurance','bookkeeping','financial_report','internal','other'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.office_staff_status AS ENUM ('active','on_leave','terminated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============ TABLES ============

-- a. Prospects
CREATE TABLE IF NOT EXISTS public.office_prospects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  code text,
  name text NOT NULL,
  tax_id text,
  contact_person text,
  phone text,
  email text,
  address text,
  industry text,
  source text,
  status public.office_prospect_status NOT NULL DEFAULT 'new',
  estimated_fee numeric DEFAULT 0,
  account_manager_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  converted_tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL,
  notes text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agency_tenant_id, code)
);
CREATE INDEX IF NOT EXISTS idx_office_prospects_agency ON public.office_prospects(agency_tenant_id, status);

-- b. Client links
CREATE TABLE IF NOT EXISTS public.office_client_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  client_tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  display_name text,
  account_manager_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  service_start_date date,
  service_end_date date,
  fee_per_month numeric DEFAULT 0,
  status public.office_link_status NOT NULL DEFAULT 'active',
  notes text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agency_tenant_id, client_tenant_id)
);
CREATE INDEX IF NOT EXISTS idx_office_links_agency ON public.office_client_links(agency_tenant_id, status);

-- c. Contracts
CREATE TABLE IF NOT EXISTS public.office_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  link_id uuid NOT NULL REFERENCES public.office_client_links(id) ON DELETE CASCADE,
  contract_no text NOT NULL,
  sign_date date,
  start_date date,
  end_date date,
  fee_amount numeric DEFAULT 0,
  billing_cycle public.office_billing_cycle NOT NULL DEFAULT 'monthly',
  services jsonb NOT NULL DEFAULT '[]'::jsonb,
  status public.office_contract_status NOT NULL DEFAULT 'draft',
  file_url text,
  notes text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agency_tenant_id, contract_no)
);
CREATE INDEX IF NOT EXISTS idx_office_contracts_link ON public.office_contracts(link_id);
CREATE INDEX IF NOT EXISTS idx_office_contracts_end ON public.office_contracts(agency_tenant_id, end_date);

CREATE TABLE IF NOT EXISTS public.office_contract_renewals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES public.office_contracts(id) ON DELETE CASCADE,
  renewed_at timestamptz NOT NULL DEFAULT now(),
  prev_end_date date,
  new_end_date date,
  new_fee_amount numeric,
  notes text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

-- d. Tasks
CREATE TABLE IF NOT EXISTS public.office_task_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  title text NOT NULL,
  category public.office_task_category NOT NULL DEFAULT 'other',
  rule_type text NOT NULL DEFAULT 'monthly_day', -- monthly_day | quarterly_offset | yearly_month_day
  rule_day int,
  rule_month int,
  lead_days int NOT NULL DEFAULT 0,
  default_assignee_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  scope text NOT NULL DEFAULT 'all_clients', -- all_clients | selected
  scope_link_ids uuid[] DEFAULT '{}',
  checklist jsonb NOT NULL DEFAULT '[]'::jsonb,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_office_templates_agency ON public.office_task_templates(agency_tenant_id, active);

CREATE TABLE IF NOT EXISTS public.office_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  link_id uuid REFERENCES public.office_client_links(id) ON DELETE SET NULL,
  contract_id uuid REFERENCES public.office_contracts(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  category public.office_task_category NOT NULL DEFAULT 'other',
  priority public.office_task_priority NOT NULL DEFAULT 'med',
  status public.office_task_status NOT NULL DEFAULT 'todo',
  assignee_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewer_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  due_date date,
  period_month int,
  period_year int,
  completed_at timestamptz,
  recurring_template_id uuid REFERENCES public.office_task_templates(id) ON DELETE SET NULL,
  checklist jsonb NOT NULL DEFAULT '[]'::jsonb,
  position int NOT NULL DEFAULT 0,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_office_tasks_agency ON public.office_tasks(agency_tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_office_tasks_assignee ON public.office_tasks(assignee_user_id);
CREATE INDEX IF NOT EXISTS idx_office_tasks_link ON public.office_tasks(link_id);
CREATE INDEX IF NOT EXISTS idx_office_tasks_due ON public.office_tasks(agency_tenant_id, due_date);
CREATE UNIQUE INDEX IF NOT EXISTS uq_office_tasks_recurring
  ON public.office_tasks(recurring_template_id, link_id, period_year, period_month)
  WHERE recurring_template_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.office_task_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.office_tasks(id) ON DELETE CASCADE,
  author_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_office_task_comments_task ON public.office_task_comments(task_id);

CREATE TABLE IF NOT EXISTS public.office_task_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.office_tasks(id) ON DELETE CASCADE,
  file_url text NOT NULL,
  file_name text,
  uploaded_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- e. Staff
CREATE TABLE IF NOT EXISTS public.office_staff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  employee_code text,
  full_name text NOT NULL,
  position text,
  department text,
  phone text,
  email text,
  join_date date,
  leave_date date,
  status public.office_staff_status NOT NULL DEFAULT 'active',
  skills text[] DEFAULT '{}',
  avatar_url text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agency_tenant_id, employee_code),
  UNIQUE (agency_tenant_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_office_staff_agency ON public.office_staff(agency_tenant_id, status);

CREATE TABLE IF NOT EXISTS public.office_staff_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES public.office_staff(id) ON DELETE CASCADE,
  link_id uuid NOT NULL REFERENCES public.office_client_links(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'lead', -- lead | assistant | reviewer
  from_date date,
  to_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (staff_id, link_id, role)
);
CREATE INDEX IF NOT EXISTS idx_office_assignments_link ON public.office_staff_assignments(link_id);

-- ============ updated_at triggers ============
CREATE TRIGGER trg_office_prospects_uat BEFORE UPDATE ON public.office_prospects
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_office_links_uat BEFORE UPDATE ON public.office_client_links
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_office_contracts_uat BEFORE UPDATE ON public.office_contracts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_office_templates_uat BEFORE UPDATE ON public.office_task_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_office_tasks_uat BEFORE UPDATE ON public.office_tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_office_staff_uat BEFORE UPDATE ON public.office_staff
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ RLS ============
ALTER TABLE public.office_prospects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.office_client_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.office_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.office_contract_renewals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.office_task_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.office_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.office_task_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.office_task_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.office_staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.office_staff_assignments ENABLE ROW LEVEL SECURITY;

-- Helper: policies use is_tenant_member(auth.uid(), agency_tenant_id)
-- Members: full CRUD; admins additionally enforced at server function level for HR/templates.

-- Prospects
CREATE POLICY office_prospects_all ON public.office_prospects
  FOR ALL TO authenticated
  USING (public.is_tenant_member(auth.uid(), agency_tenant_id))
  WITH CHECK (public.is_tenant_member(auth.uid(), agency_tenant_id));

-- Client links
CREATE POLICY office_links_all ON public.office_client_links
  FOR ALL TO authenticated
  USING (public.is_tenant_member(auth.uid(), agency_tenant_id))
  WITH CHECK (public.is_tenant_member(auth.uid(), agency_tenant_id));

-- Contracts
CREATE POLICY office_contracts_all ON public.office_contracts
  FOR ALL TO authenticated
  USING (public.is_tenant_member(auth.uid(), agency_tenant_id))
  WITH CHECK (public.is_tenant_member(auth.uid(), agency_tenant_id));

CREATE POLICY office_renewals_all ON public.office_contract_renewals
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.office_contracts c
    WHERE c.id = contract_id AND public.is_tenant_member(auth.uid(), c.agency_tenant_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.office_contracts c
    WHERE c.id = contract_id AND public.is_tenant_member(auth.uid(), c.agency_tenant_id)
  ));

-- Task templates (admins only enforced in server fns; RLS allows members to read)
CREATE POLICY office_templates_select ON public.office_task_templates
  FOR SELECT TO authenticated
  USING (public.is_tenant_member(auth.uid(), agency_tenant_id));
CREATE POLICY office_templates_write ON public.office_task_templates
  FOR ALL TO authenticated
  USING (public.has_tenant_role(auth.uid(), agency_tenant_id, ARRAY['owner','admin']))
  WITH CHECK (public.has_tenant_role(auth.uid(), agency_tenant_id, ARRAY['owner','admin']));

-- Tasks
CREATE POLICY office_tasks_all ON public.office_tasks
  FOR ALL TO authenticated
  USING (public.is_tenant_member(auth.uid(), agency_tenant_id))
  WITH CHECK (public.is_tenant_member(auth.uid(), agency_tenant_id));

CREATE POLICY office_task_comments_all ON public.office_task_comments
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.office_tasks t
    WHERE t.id = task_id AND public.is_tenant_member(auth.uid(), t.agency_tenant_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.office_tasks t
    WHERE t.id = task_id AND public.is_tenant_member(auth.uid(), t.agency_tenant_id)
  ));

CREATE POLICY office_task_attachments_all ON public.office_task_attachments
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.office_tasks t
    WHERE t.id = task_id AND public.is_tenant_member(auth.uid(), t.agency_tenant_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.office_tasks t
    WHERE t.id = task_id AND public.is_tenant_member(auth.uid(), t.agency_tenant_id)
  ));

-- Staff
CREATE POLICY office_staff_select ON public.office_staff
  FOR SELECT TO authenticated
  USING (public.is_tenant_member(auth.uid(), agency_tenant_id));
CREATE POLICY office_staff_write ON public.office_staff
  FOR ALL TO authenticated
  USING (public.has_tenant_role(auth.uid(), agency_tenant_id, ARRAY['owner','admin']))
  WITH CHECK (public.has_tenant_role(auth.uid(), agency_tenant_id, ARRAY['owner','admin']));

CREATE POLICY office_assignments_all ON public.office_staff_assignments
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.office_staff s
    WHERE s.id = staff_id AND public.is_tenant_member(auth.uid(), s.agency_tenant_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.office_staff s
    WHERE s.id = staff_id AND public.has_tenant_role(auth.uid(), s.agency_tenant_id, ARRAY['owner','admin'])
  ));
