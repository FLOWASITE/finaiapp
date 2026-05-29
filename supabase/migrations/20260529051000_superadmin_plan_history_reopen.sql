-- Migration: tenant_plan_history table for billing audit
-- Tự lưu mỗi lần thay đổi gói qua trigger trên tenant_plans.
CREATE TABLE IF NOT EXISTS public.tenant_plan_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  plan text NOT NULL,
  seats_limit integer,
  ai_tokens_quota bigint,
  storage_quota_mb integer,
  period_start date,
  period_end date,
  notes text,
  changed_by uuid,
  changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tenant_plan_history_tenant
  ON public.tenant_plan_history (tenant_id, changed_at DESC);

ALTER TABLE public.tenant_plan_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "superadmin all on tenant_plan_history" ON public.tenant_plan_history;
CREATE POLICY "superadmin all on tenant_plan_history" ON public.tenant_plan_history
  FOR ALL USING (public.is_superadmin(auth.uid())) WITH CHECK (public.is_superadmin(auth.uid()));

DROP POLICY IF EXISTS "tenant members read tenant_plan_history" ON public.tenant_plan_history;
CREATE POLICY "tenant members read tenant_plan_history" ON public.tenant_plan_history
  FOR SELECT USING (public.is_tenant_member(auth.uid(), tenant_id));

-- Trigger: lưu snapshot mỗi lần plan thay đổi
CREATE OR REPLACE FUNCTION public.tenant_plans_log_history()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.tenant_plan_history (
    tenant_id, plan, seats_limit, ai_tokens_quota, storage_quota_mb,
    period_start, period_end, notes, changed_by
  ) VALUES (
    NEW.tenant_id, NEW.plan, NEW.seats_limit, NEW.ai_tokens_quota, NEW.storage_quota_mb,
    NEW.period_start, NEW.period_end, NEW.notes, NEW.updated_by
  );
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_tenant_plans_history ON public.tenant_plans;
CREATE TRIGGER trg_tenant_plans_history
AFTER INSERT OR UPDATE OF plan, seats_limit, ai_tokens_quota, storage_quota_mb, period_start, period_end
ON public.tenant_plans
FOR EACH ROW EXECUTE FUNCTION public.tenant_plans_log_history();

-- Reopen fiscal_period helper RPC for super-admin emergency unlock
CREATE OR REPLACE FUNCTION public.fn_superadmin_reopen_fiscal_period(_period_id uuid, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _tenant uuid;
  _before jsonb;
BEGIN
  IF NOT public.is_superadmin(auth.uid()) THEN
    RAISE EXCEPTION 'Only superadmin can reopen fiscal periods';
  END IF;

  SELECT tenant_id, to_jsonb(fp.*) INTO _tenant, _before
  FROM public.fiscal_periods fp WHERE id = _period_id;
  IF _tenant IS NULL THEN RAISE EXCEPTION 'fiscal_period not found'; END IF;

  UPDATE public.fiscal_periods
     SET status = 'open', closed_at = NULL,
         note = COALESCE(note, '') || E'\n[reopened by superadmin] ' || COALESCE(_reason,'')
   WHERE id = _period_id;

  INSERT INTO public.audit_logs (user_id, actor_email, action, table_name, record_id, tenant_id, before, after)
  VALUES (
    auth.uid(),
    (SELECT email FROM auth.users WHERE id = auth.uid()),
    'superadmin.fiscal_period.reopen',
    'fiscal_periods',
    _period_id,
    _tenant,
    _before,
    jsonb_build_object('reason', _reason, 'reopened_at', now())
  );
END $$;

REVOKE EXECUTE ON FUNCTION public.fn_superadmin_reopen_fiscal_period(uuid, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.fn_superadmin_reopen_fiscal_period(uuid, text) TO authenticated;
