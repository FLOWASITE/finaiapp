ALTER TABLE public.inbox_rules
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS disabled_at TIMESTAMPTZ;

ALTER TABLE public.inbox_rules DROP CONSTRAINT IF EXISTS inbox_rules_source_check;
ALTER TABLE public.inbox_rules ADD CONSTRAINT inbox_rules_source_check CHECK (source IN ('manual','auto'));

CREATE INDEX IF NOT EXISTS idx_inbox_rules_active_partner
  ON public.inbox_rules (tenant_id, pattern_value)
  WHERE enabled = true AND disabled_at IS NULL;