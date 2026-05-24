
-- 1. confidence_calibration: per-tenant calibration state
CREATE TABLE public.confidence_calibration (
  tenant_id UUID PRIMARY KEY,
  auto_threshold NUMERIC(4,3) NOT NULL DEFAULT 0.85,
  review_threshold NUMERIC(4,3) NOT NULL DEFAULT 0.60,
  signal_weights JSONB NOT NULL DEFAULT '{}'::jsonb,
  sample_size INT NOT NULL DEFAULT 0,
  accuracy_auto NUMERIC(4,3),
  accuracy_review NUMERIC(4,3),
  last_calibrated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.confidence_calibration ENABLE ROW LEVEL SECURITY;

CREATE POLICY "calibration_select"
  ON public.confidence_calibration FOR SELECT
  USING (is_tenant_member(auth.uid(), tenant_id));

CREATE POLICY "calibration_write"
  ON public.confidence_calibration FOR ALL
  USING (has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin']))
  WITH CHECK (has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin']));

CREATE TRIGGER confidence_calibration_set_updated_at
  BEFORE UPDATE ON public.confidence_calibration
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 2. calibration_runs: audit log
CREATE TABLE public.calibration_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  ran_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  window_days INT NOT NULL,
  sample_size INT NOT NULL,
  old_threshold NUMERIC(4,3),
  new_threshold NUMERIC(4,3),
  old_weights JSONB,
  new_weights JSONB,
  metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  note TEXT
);

CREATE INDEX idx_calibration_runs_tenant_recent
  ON public.calibration_runs (tenant_id, ran_at DESC);

ALTER TABLE public.calibration_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "calibration_runs_select"
  ON public.calibration_runs FOR SELECT
  USING (is_tenant_member(auth.uid(), tenant_id));

-- 3. signals column on proposals
ALTER TABLE public.ai_journal_proposals
  ADD COLUMN signals JSONB NOT NULL DEFAULT '{}'::jsonb;
