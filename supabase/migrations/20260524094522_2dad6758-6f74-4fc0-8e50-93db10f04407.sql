
CREATE TABLE public.ai_agents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL,
  agent_id TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  mode TEXT NOT NULL DEFAULT 'auto',
  confidence_threshold NUMERIC NOT NULL DEFAULT 0.85,
  confidence_profile TEXT NOT NULL DEFAULT 'balanced',
  notify_on JSONB NOT NULL DEFAULT '{"error":true,"warning":true,"completion":false}'::jsonb,
  schedule JSONB NOT NULL DEFAULT '{"type":"always"}'::jsonb,
  status TEXT NOT NULL DEFAULT 'idle',
  status_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, agent_id)
);
CREATE INDEX idx_ai_agents_tenant ON public.ai_agents(tenant_id);
ALTER TABLE public.ai_agents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members read agents" ON public.ai_agents FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.tenant_members m WHERE m.tenant_id = ai_agents.tenant_id AND m.user_id = auth.uid()));
CREATE POLICY "Tenant members write agents" ON public.ai_agents FOR ALL
  USING (EXISTS (SELECT 1 FROM public.tenant_members m WHERE m.tenant_id = ai_agents.tenant_id AND m.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.tenant_members m WHERE m.tenant_id = ai_agents.tenant_id AND m.user_id = auth.uid()));

CREATE TABLE public.ai_agent_activity_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL,
  agent_id TEXT NOT NULL,
  action TEXT NOT NULL,
  result TEXT NOT NULL DEFAULT 'success',
  duration_ms INTEGER,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ai_agent_logs_tenant_agent_time ON public.ai_agent_activity_logs(tenant_id, agent_id, created_at DESC);
ALTER TABLE public.ai_agent_activity_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members read agent logs" ON public.ai_agent_activity_logs FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.tenant_members m WHERE m.tenant_id = ai_agent_activity_logs.tenant_id AND m.user_id = auth.uid()));
CREATE POLICY "Tenant members insert agent logs" ON public.ai_agent_activity_logs FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.tenant_members m WHERE m.tenant_id = ai_agent_activity_logs.tenant_id AND m.user_id = auth.uid()));

CREATE TRIGGER trg_ai_agents_updated_at
BEFORE UPDATE ON public.ai_agents
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
