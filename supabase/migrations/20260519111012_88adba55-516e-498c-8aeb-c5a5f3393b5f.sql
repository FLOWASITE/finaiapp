-- ============================================================
-- Sổ AI: rules learned from user edits + audit log of decisions
-- ============================================================

CREATE TABLE IF NOT EXISTS public.inbox_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL,
  pattern_kind text NOT NULL CHECK (pattern_kind IN ('partner','memo','amount_range','source','partner_amount')),
  pattern_value text NOT NULL,
  apply_account text,
  apply_dimension jsonb NOT NULL DEFAULT '{}'::jsonb,
  confidence_boost int NOT NULL DEFAULT 25 CHECK (confidence_boost BETWEEN 0 AND 100),
  note text,
  enabled boolean NOT NULL DEFAULT true,
  hit_count int NOT NULL DEFAULT 0,
  last_hit_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inbox_rules_lookup
  ON public.inbox_rules (tenant_id, pattern_kind, pattern_value)
  WHERE enabled = true;

ALTER TABLE public.inbox_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant inbox_rules select"
  ON public.inbox_rules FOR SELECT
  USING (tenant_id IS NOT NULL AND public.is_tenant_member(auth.uid(), tenant_id));

CREATE POLICY "tenant inbox_rules insert"
  ON public.inbox_rules FOR INSERT
  WITH CHECK (
    tenant_id = public.current_tenant_id()
    AND auth.uid() = user_id
    AND public.has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin','accountant'])
  );

CREATE POLICY "tenant inbox_rules update"
  ON public.inbox_rules FOR UPDATE
  USING (
    tenant_id IS NOT NULL
    AND public.has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin','accountant'])
  );

CREATE POLICY "tenant inbox_rules delete"
  ON public.inbox_rules FOR DELETE
  USING (
    tenant_id IS NOT NULL
    AND public.has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin','accountant'])
  );

CREATE TRIGGER trg_inbox_rules_updated_at
  BEFORE UPDATE ON public.inbox_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
CREATE TABLE IF NOT EXISTS public.inbox_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL,
  item_source text NOT NULL CHECK (item_source IN ('tct_einvoice','email_forward','bank_statement','cash','ai_insight','document')),
  item_external_id text NOT NULL,
  action text NOT NULL CHECK (action IN ('approve','edit','skip','escalate','bulk_approve')),
  confidence_at_decision int,
  original_entry jsonb,
  final_entry jsonb,
  rule_id uuid REFERENCES public.inbox_rules(id) ON DELETE SET NULL,
  journal_entry_id uuid,
  note text,
  decided_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inbox_decisions_source
  ON public.inbox_decisions (tenant_id, item_source, item_external_id);

CREATE INDEX IF NOT EXISTS idx_inbox_decisions_recent
  ON public.inbox_decisions (tenant_id, decided_at DESC);

ALTER TABLE public.inbox_decisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant inbox_decisions select"
  ON public.inbox_decisions FOR SELECT
  USING (tenant_id IS NOT NULL AND public.is_tenant_member(auth.uid(), tenant_id));

CREATE POLICY "tenant inbox_decisions insert"
  ON public.inbox_decisions FOR INSERT
  WITH CHECK (
    tenant_id = public.current_tenant_id()
    AND auth.uid() = user_id
    AND public.is_tenant_member(auth.uid(), tenant_id)
  );

CREATE POLICY "tenant inbox_decisions delete"
  ON public.inbox_decisions FOR DELETE
  USING (
    tenant_id IS NOT NULL
    AND public.has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin'])
  );
