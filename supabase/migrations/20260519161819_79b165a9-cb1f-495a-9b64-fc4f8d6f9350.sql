
CREATE TABLE public.ai_memory_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  type text NOT NULL CHECK (type IN ('suggestion','active','disabled')),
  source text CHECK (source IN ('ai-learned','user-taught')),
  title text NOT NULL,
  when_text text NOT NULL,
  then_text text NOT NULL,
  origin text,
  applied_count int NOT NULL DEFAULT 0,
  accuracy_correct int NOT NULL DEFAULT 0,
  accuracy_total int NOT NULL DEFAULT 0,
  last_used_at timestamptz,
  disable_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ai_memory_rules_tenant_idx ON public.ai_memory_rules(tenant_id, type);

ALTER TABLE public.ai_memory_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_memory_rules_member_select" ON public.ai_memory_rules
  FOR SELECT USING (public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "ai_memory_rules_member_insert" ON public.ai_memory_rules
  FOR INSERT WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "ai_memory_rules_member_update" ON public.ai_memory_rules
  FOR UPDATE USING (public.is_tenant_member(auth.uid(), tenant_id))
  WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "ai_memory_rules_member_delete" ON public.ai_memory_rules
  FOR DELETE USING (public.is_tenant_member(auth.uid(), tenant_id));

CREATE TRIGGER ai_memory_rules_set_updated_at
  BEFORE UPDATE ON public.ai_memory_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


CREATE TABLE public.ai_memory_watch (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  created_by uuid DEFAULT auth.uid(),
  text text NOT NULL,
  seen_count int NOT NULL DEFAULT 0,
  target_count int NOT NULL DEFAULT 5,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ai_memory_watch_tenant_idx ON public.ai_memory_watch(tenant_id);

ALTER TABLE public.ai_memory_watch ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_memory_watch_member_select" ON public.ai_memory_watch
  FOR SELECT USING (public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "ai_memory_watch_member_insert" ON public.ai_memory_watch
  FOR INSERT WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "ai_memory_watch_member_update" ON public.ai_memory_watch
  FOR UPDATE USING (public.is_tenant_member(auth.uid(), tenant_id))
  WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "ai_memory_watch_member_delete" ON public.ai_memory_watch
  FOR DELETE USING (public.is_tenant_member(auth.uid(), tenant_id));

CREATE TRIGGER ai_memory_watch_set_updated_at
  BEFORE UPDATE ON public.ai_memory_watch
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
