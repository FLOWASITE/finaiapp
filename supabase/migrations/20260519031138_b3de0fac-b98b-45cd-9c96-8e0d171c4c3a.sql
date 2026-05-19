
CREATE TABLE IF NOT EXISTS public.ai_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  severity text NOT NULL DEFAULT 'info' CHECK (severity IN ('info','warn','critical')),
  category text NOT NULL,
  title text NOT NULL,
  body text,
  action_url text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  dedupe_key text,
  dismissed_at timestamptz,
  dismissed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, dedupe_key)
);

CREATE INDEX IF NOT EXISTS idx_ai_insights_tenant_active
  ON public.ai_insights (tenant_id, dismissed_at, created_at DESC);

ALTER TABLE public.ai_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members view insights"
  ON public.ai_insights FOR SELECT TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id));

CREATE POLICY "staff manage insights"
  ON public.ai_insights FOR ALL TO authenticated
  USING (public.has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin','accountant']))
  WITH CHECK (public.has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin','accountant']));

CREATE TRIGGER trg_ai_insights_updated
  BEFORE UPDATE ON public.ai_insights
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Cron daily 7AM ICT (00:00 UTC)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
BEGIN
  PERFORM cron.unschedule('ai-daily-digest');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'ai-daily-digest',
  '0 0 * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--a216c878-9c09-4a74-859c-2065765714a4.lovable.app/api/public/ai-daily-digest',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'apikey','eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJwdGJwcmN3cG1pdXhhc3l0b3lwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg5OTkxMTEsImV4cCI6MjA5NDU3NTExMX0.Odtf0aloENPfdzJmIe0k4D5oT37Zd5XyMIkph58iCkE'
    ),
    body := '{}'::jsonb
  );
  $$
);
