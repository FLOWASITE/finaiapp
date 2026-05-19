CREATE TABLE public.ai_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  tenant_id uuid,
  tool_name text NOT NULL,
  input jsonb NOT NULL DEFAULT '{}'::jsonb,
  summary text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','executed','cancelled','failed')),
  result jsonb,
  result_ref_table text,
  result_ref_id uuid,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  executed_at timestamptz
);

CREATE INDEX ai_actions_user_status_idx ON public.ai_actions (user_id, status, created_at DESC);

ALTER TABLE public.ai_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own ai_actions all" ON public.ai_actions
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

ALTER PUBLICATION supabase_realtime ADD TABLE public.ai_actions;
ALTER TABLE public.ai_actions REPLICA IDENTITY FULL;