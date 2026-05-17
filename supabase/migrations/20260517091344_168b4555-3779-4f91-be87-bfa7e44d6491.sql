
CREATE TABLE public.report_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  report_type text NOT NULL,
  period_from date,
  period_to date NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.report_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own report_snapshots all" ON public.report_snapshots FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_report_snapshots_user_type_period ON public.report_snapshots(user_id, report_type, period_to DESC);

CREATE TABLE public.report_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  section text NOT NULL,
  content text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, section)
);
ALTER TABLE public.report_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own report_notes all" ON public.report_notes FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
