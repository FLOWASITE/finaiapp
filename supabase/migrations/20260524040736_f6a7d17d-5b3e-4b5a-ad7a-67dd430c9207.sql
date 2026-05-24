CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TABLE public.ai_memory_graph_layout (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  positions jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, tenant_id)
);

ALTER TABLE public.ai_memory_graph_layout ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own layout" ON public.ai_memory_graph_layout FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own layout" ON public.ai_memory_graph_layout FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own layout" ON public.ai_memory_graph_layout FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own layout" ON public.ai_memory_graph_layout FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER trg_ai_memory_graph_layout_updated
  BEFORE UPDATE ON public.ai_memory_graph_layout
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();