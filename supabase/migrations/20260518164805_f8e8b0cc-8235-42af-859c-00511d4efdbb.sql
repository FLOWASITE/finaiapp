
CREATE TABLE public.fa_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  asset_id UUID NOT NULL REFERENCES public.fixed_assets(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('TRANSFER','REVALUATION','MAJOR_REPAIR','PARTIAL_DISPOSAL')),
  event_date DATE NOT NULL DEFAULT CURRENT_DATE,
  amount NUMERIC,
  description TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  journal_entry_id UUID REFERENCES public.journal_entries(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'posted' CHECK (status IN ('draft','posted','void')),
  void_reason TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_fa_events_asset ON public.fa_events (asset_id, event_date DESC);
CREATE INDEX idx_fa_events_tenant_type ON public.fa_events (tenant_id, event_type, event_date DESC);

ALTER TABLE public.fa_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant fa_events select" ON public.fa_events FOR SELECT
  USING (tenant_id IS NOT NULL AND is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "tenant fa_events insert" ON public.fa_events FOR INSERT
  WITH CHECK (tenant_id IS NOT NULL AND tenant_id = current_tenant_id()
              AND has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin','accountant']));
CREATE POLICY "tenant fa_events update" ON public.fa_events FOR UPDATE
  USING (tenant_id IS NOT NULL AND has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin','accountant']));
CREATE POLICY "tenant fa_events delete" ON public.fa_events FOR DELETE
  USING (tenant_id IS NOT NULL AND has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin','accountant']));

CREATE TRIGGER fa_events_set_updated_at BEFORE UPDATE ON public.fa_events
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
