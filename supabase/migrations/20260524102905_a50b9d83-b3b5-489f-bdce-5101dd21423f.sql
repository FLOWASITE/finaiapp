-- Vendor templates: lưu bút toán mẫu (không chỉ 1 mã TK default)
ALTER TABLE public.ai_memory_partners
  ADD COLUMN IF NOT EXISTS template_lines jsonb,
  ADD COLUMN IF NOT EXISTS template_version int NOT NULL DEFAULT 0;

-- Cache proposal cho UI hàng đợi hạch toán
CREATE TABLE IF NOT EXISTS public.ai_journal_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  dto jsonb NOT NULL,
  confidence numeric(4,3) NOT NULL DEFAULT 0,
  source text NOT NULL CHECK (source IN ('vendor_template','learned_lines','classify_rule','ai_fallback','manual')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','skipped','auto_posted','failed')),
  auto_posted boolean NOT NULL DEFAULT false,
  journal_entry_id uuid,
  warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid,
  UNIQUE(invoice_id)
);

CREATE INDEX IF NOT EXISTS ai_journal_proposals_tenant_status_idx
  ON public.ai_journal_proposals (tenant_id, status, created_at DESC);

ALTER TABLE public.ai_journal_proposals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "proposals_select" ON public.ai_journal_proposals
  FOR SELECT USING (is_tenant_member(auth.uid(), tenant_id));

CREATE POLICY "proposals_write" ON public.ai_journal_proposals
  FOR ALL
  USING (has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin','accountant']))
  WITH CHECK (has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin','accountant']));

CREATE TRIGGER ai_journal_proposals_set_updated_at
  BEFORE UPDATE ON public.ai_journal_proposals
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER PUBLICATION supabase_realtime ADD TABLE public.ai_journal_proposals;
ALTER TABLE public.ai_journal_proposals REPLICA IDENTITY FULL;