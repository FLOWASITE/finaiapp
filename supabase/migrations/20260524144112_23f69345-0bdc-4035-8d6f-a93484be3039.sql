
-- Event log: feedback từ agent này gửi agent khác
CREATE TABLE public.agent_feedback_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  source_agent text NOT NULL CHECK (source_agent IN ('reconcile','review','manual')),
  target_agent text NOT NULL DEFAULT 'categorize',
  event_type text NOT NULL CHECK (event_type IN ('wrong_account','wrong_amount','wrong_partner','wrong_vat','duplicate','missed_entry')),
  severity numeric(3,2) NOT NULL DEFAULT 0.5 CHECK (severity >= 0 AND severity <= 1),
  journal_entry_id uuid,
  bank_transaction_id uuid,
  proposal_id uuid,
  signals_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  note text,
  created_by uuid,
  processed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX agent_feedback_events_tenant_idx ON public.agent_feedback_events(tenant_id, created_at DESC);
CREATE INDEX agent_feedback_events_entry_idx ON public.agent_feedback_events(journal_entry_id);

ALTER TABLE public.agent_feedback_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "feedback_events_select" ON public.agent_feedback_events
  FOR SELECT USING (public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "feedback_events_insert" ON public.agent_feedback_events
  FOR INSERT WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "feedback_events_admin_write" ON public.agent_feedback_events
  FOR UPDATE USING (public.has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin']));

-- Aggregated penalty score
CREATE TABLE public.ai_rule_penalties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  target_kind text NOT NULL CHECK (target_kind IN ('rule','memory','partner_history')),
  target_id uuid NOT NULL,
  penalty_score numeric(6,3) NOT NULL DEFAULT 0,
  wrong_count integer NOT NULL DEFAULT 0,
  last_penalty_at timestamptz,
  last_event_id uuid,
  auto_demoted_at timestamptz,
  auto_demoted_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, target_kind, target_id)
);

CREATE INDEX ai_rule_penalties_tenant_score_idx ON public.ai_rule_penalties(tenant_id, penalty_score DESC);

ALTER TABLE public.ai_rule_penalties ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rule_penalties_select" ON public.ai_rule_penalties
  FOR SELECT USING (public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "rule_penalties_admin_write" ON public.ai_rule_penalties
  FOR ALL USING (public.has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin']))
  WITH CHECK (public.has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin']));

CREATE TRIGGER set_ai_rule_penalties_updated_at
  BEFORE UPDATE ON public.ai_rule_penalties
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
