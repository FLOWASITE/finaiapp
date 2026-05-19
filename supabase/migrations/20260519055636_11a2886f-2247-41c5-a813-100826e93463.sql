-- 1. tenants status
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  ADD COLUMN IF NOT EXISTS suspended_at timestamptz,
  ADD COLUMN IF NOT EXISTS suspended_reason text;

CREATE OR REPLACE FUNCTION public.is_tenant_suspended(_tenant uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.tenants WHERE id = _tenant AND status = 'suspended')
$$;

-- 2. security_policies (singleton)
CREATE TABLE IF NOT EXISTS public.security_policies (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  require_2fa_for_roles jsonb NOT NULL DEFAULT '[]'::jsonb,
  ip_allowlist_enabled boolean NOT NULL DEFAULT false,
  session_timeout_minutes integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
INSERT INTO public.security_policies(id) VALUES (1) ON CONFLICT DO NOTHING;
ALTER TABLE public.security_policies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "superadmin all on security_policies" ON public.security_policies
  FOR ALL USING (public.is_superadmin(auth.uid())) WITH CHECK (public.is_superadmin(auth.uid()));

-- 3. ip_allowlist
CREATE TABLE IF NOT EXISTS public.ip_allowlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL CHECK (scope IN ('global','tenant')),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  cidr text NOT NULL,
  label text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ip_allowlist ENABLE ROW LEVEL SECURITY;
CREATE POLICY "superadmin all on ip_allowlist" ON public.ip_allowlist
  FOR ALL USING (public.is_superadmin(auth.uid())) WITH CHECK (public.is_superadmin(auth.uid()));

-- 4. system_backups
CREATE TABLE IF NOT EXISTS public.system_backups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL,
  kind text NOT NULL DEFAULT 'tenant_export',
  file_path text,
  row_counts jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','done','error')),
  error text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
ALTER TABLE public.system_backups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "superadmin all on system_backups" ON public.system_backups
  FOR ALL USING (public.is_superadmin(auth.uid())) WITH CHECK (public.is_superadmin(auth.uid()));
CREATE INDEX IF NOT EXISTS idx_system_backups_created_at ON public.system_backups(created_at DESC);

-- 5. system_job_runs
CREATE TABLE IF NOT EXISTS public.system_job_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job text NOT NULL,
  params jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','done','error')),
  started_at timestamptz,
  finished_at timestamptz,
  error text,
  output jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.system_job_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "superadmin all on system_job_runs" ON public.system_job_runs
  FOR ALL USING (public.is_superadmin(auth.uid())) WITH CHECK (public.is_superadmin(auth.uid()));
CREATE INDEX IF NOT EXISTS idx_system_job_runs_created_at ON public.system_job_runs(created_at DESC);

-- 6. system_settings (singleton JSON)
CREATE TABLE IF NOT EXISTS public.system_settings (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
INSERT INTO public.system_settings(id, value) VALUES (1, jsonb_build_object(
  'branding', jsonb_build_object('app_name','FinAI','support_email',null,'footer',null),
  'features', jsonb_build_object('einvoice',true,'payroll',true,'inventory',true,'ai_parse',true,'ai_chat',true),
  'format', jsonb_build_object('timezone','Asia/Ho_Chi_Minh','currency','VND','date_format','dd/MM/yyyy','locale','vi-VN'),
  'ai_policy', jsonb_build_object('tokens_per_day_per_tenant',0,'files_parse_per_day',0),
  'plans', jsonb_build_array(
    jsonb_build_object('code','free','name','Free','seats',2,'ai_tokens',50000,'storage_mb',500),
    jsonb_build_object('code','pro','name','Pro','seats',10,'ai_tokens',500000,'storage_mb',5000),
    jsonb_build_object('code','business','name','Business','seats',50,'ai_tokens',2000000,'storage_mb',20000),
    jsonb_build_object('code','enterprise','name','Enterprise','seats',null,'ai_tokens',null,'storage_mb',null)
  )
)) ON CONFLICT DO NOTHING;
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "superadmin all on system_settings" ON public.system_settings
  FOR ALL USING (public.is_superadmin(auth.uid())) WITH CHECK (public.is_superadmin(auth.uid()));
-- members can READ settings (for feature flags affecting UI)
CREATE POLICY "auth read system_settings" ON public.system_settings
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- 7. tenant_plans
CREATE TABLE IF NOT EXISTS public.tenant_plans (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  plan text NOT NULL DEFAULT 'free',
  seats_limit integer,
  ai_tokens_quota bigint,
  storage_quota_mb integer,
  period_start date,
  period_end date,
  status text NOT NULL DEFAULT 'active',
  notes text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
ALTER TABLE public.tenant_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "superadmin all on tenant_plans" ON public.tenant_plans
  FOR ALL USING (public.is_superadmin(auth.uid())) WITH CHECK (public.is_superadmin(auth.uid()));
CREATE POLICY "tenant members read tenant_plans" ON public.tenant_plans
  FOR SELECT USING (public.is_tenant_member(auth.uid(), tenant_id));

-- 8. tenant_usage
CREATE TABLE IF NOT EXISTS public.tenant_usage (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  period_ym text NOT NULL,
  ai_tokens_used bigint NOT NULL DEFAULT 0,
  ai_files_parsed integer NOT NULL DEFAULT 0,
  storage_used_mb numeric NOT NULL DEFAULT 0,
  documents_count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, period_ym)
);
ALTER TABLE public.tenant_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "superadmin all on tenant_usage" ON public.tenant_usage
  FOR ALL USING (public.is_superadmin(auth.uid())) WITH CHECK (public.is_superadmin(auth.uid()));
CREATE POLICY "tenant members read tenant_usage" ON public.tenant_usage
  FOR SELECT USING (public.is_tenant_member(auth.uid(), tenant_id));

-- 9. backups bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('backups','backups', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "superadmin read backups" ON storage.objects
  FOR SELECT USING (bucket_id = 'backups' AND public.is_superadmin(auth.uid()));
CREATE POLICY "superadmin write backups" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'backups' AND public.is_superadmin(auth.uid()));
CREATE POLICY "superadmin update backups" ON storage.objects
  FOR UPDATE USING (bucket_id = 'backups' AND public.is_superadmin(auth.uid()));
CREATE POLICY "superadmin delete backups" ON storage.objects
  FOR DELETE USING (bucket_id = 'backups' AND public.is_superadmin(auth.uid()));

-- updated_at triggers
CREATE TRIGGER trg_security_policies_updated BEFORE UPDATE ON public.security_policies
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_system_settings_updated BEFORE UPDATE ON public.system_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_tenant_plans_updated BEFORE UPDATE ON public.tenant_plans
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_tenant_usage_updated BEFORE UPDATE ON public.tenant_usage
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();