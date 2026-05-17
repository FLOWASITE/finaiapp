
-- 1. Extend role enum (new values usable after this migration commits)
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'accountant';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'approver';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'viewer';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'superadmin';

-- 2. Audit log table
CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  actor_email text,
  action text NOT NULL,
  table_name text,
  record_id uuid,
  before jsonb,
  after jsonb,
  ip text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_logs_user_created ON public.audit_logs(user_id, created_at DESC);
CREATE INDEX idx_audit_logs_table ON public.audit_logs(table_name, created_at DESC);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Helper: superadmin check using text cast (avoids same-tx enum literal issue)
CREATE OR REPLACE FUNCTION public.is_superadmin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role::text = 'superadmin'
  )
$$;

CREATE OR REPLACE FUNCTION public.has_any_role(_user_id uuid, _roles text[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role::text = ANY(_roles)
  )
$$;

CREATE POLICY "audit_logs view own"
  ON public.audit_logs FOR SELECT
  USING (auth.uid() = user_id OR public.is_superadmin(auth.uid()));

-- No INSERT/UPDATE/DELETE policy: writes happen only via SECURITY DEFINER trigger.

-- 3. User invitations
CREATE TABLE public.user_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_owner_id uuid NOT NULL,
  invited_by uuid NOT NULL,
  email text NOT NULL,
  role text NOT NULL CHECK (role IN ('owner','accountant','approver','viewer')),
  token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  accepted_at timestamptz,
  accepted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_invitations_owner ON public.user_invitations(tenant_owner_id);
CREATE INDEX idx_invitations_email ON public.user_invitations(email);

ALTER TABLE public.user_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner manage invitations"
  ON public.user_invitations FOR ALL
  USING (auth.uid() = tenant_owner_id AND public.has_role(auth.uid(), 'owner'))
  WITH CHECK (auth.uid() = tenant_owner_id AND public.has_role(auth.uid(), 'owner'));

CREATE POLICY "invitee view by email"
  ON public.user_invitations FOR SELECT
  USING (email = (auth.jwt() ->> 'email'));

-- 4. Generic audit trigger
CREATE OR REPLACE FUNCTION public.audit_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  v_record_id uuid;
  v_before jsonb;
  v_after jsonb;
BEGIN
  IF v_uid IS NOT NULL THEN
    SELECT email INTO v_email FROM public.profiles WHERE id = v_uid;
  END IF;

  IF TG_OP = 'DELETE' THEN
    v_before := to_jsonb(OLD);
    BEGIN v_record_id := (OLD.id)::uuid; EXCEPTION WHEN others THEN v_record_id := NULL; END;
  ELSIF TG_OP = 'UPDATE' THEN
    v_before := to_jsonb(OLD);
    v_after := to_jsonb(NEW);
    BEGIN v_record_id := (NEW.id)::uuid; EXCEPTION WHEN others THEN v_record_id := NULL; END;
  ELSE
    v_after := to_jsonb(NEW);
    BEGIN v_record_id := (NEW.id)::uuid; EXCEPTION WHEN others THEN v_record_id := NULL; END;
  END IF;

  INSERT INTO public.audit_logs (user_id, actor_email, action, table_name, record_id, before, after)
  VALUES (v_uid, v_email, lower(TG_OP), TG_TABLE_NAME, v_record_id, v_before, v_after);

  RETURN COALESCE(NEW, OLD);
END $$;

-- Attach triggers to sensitive tables
CREATE TRIGGER audit_invoices AFTER INSERT OR UPDATE OR DELETE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();
CREATE TRIGGER audit_sales_invoices AFTER INSERT OR UPDATE OR DELETE ON public.sales_invoices
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();
CREATE TRIGGER audit_journal_entries AFTER INSERT OR UPDATE OR DELETE ON public.journal_entries
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();
CREATE TRIGGER audit_payroll_runs AFTER INSERT OR UPDATE OR DELETE ON public.payroll_runs
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();
CREATE TRIGGER audit_period_locks AFTER INSERT OR UPDATE OR DELETE ON public.period_locks
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();
CREATE TRIGGER audit_user_roles AFTER INSERT OR UPDATE OR DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();
