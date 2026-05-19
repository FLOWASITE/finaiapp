
CREATE TABLE IF NOT EXISTS public.user_digest_prefs (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  send_hour int NOT NULL DEFAULT 8 CHECK (send_hour BETWEEN 0 AND 23),
  last_sent_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, tenant_id)
);

ALTER TABLE public.user_digest_prefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own digest prefs select" ON public.user_digest_prefs
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own digest prefs insert" ON public.user_digest_prefs
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own digest prefs update" ON public.user_digest_prefs
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "own digest prefs delete" ON public.user_digest_prefs
  FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER trg_user_digest_prefs_updated
  BEFORE UPDATE ON public.user_digest_prefs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_user_digest_prefs_due
  ON public.user_digest_prefs (enabled, send_hour, last_sent_date);
