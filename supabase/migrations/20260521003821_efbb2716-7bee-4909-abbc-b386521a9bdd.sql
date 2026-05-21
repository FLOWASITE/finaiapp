
CREATE TABLE public.einvoice_journal_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL,
  einvoice_id uuid NOT NULL REFERENCES public.einvoices(id) ON DELETE CASCADE,
  entry_date date NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','posted','discarded')),
  posted_entry_id uuid REFERENCES public.journal_entries(id) ON DELETE SET NULL,
  posted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_einvoice_journal_drafts_einvoice
  ON public.einvoice_journal_drafts(einvoice_id) WHERE status <> 'discarded';
CREATE INDEX idx_einvoice_journal_drafts_tenant ON public.einvoice_journal_drafts(tenant_id, status);

CREATE TABLE public.einvoice_journal_draft_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id uuid NOT NULL REFERENCES public.einvoice_journal_drafts(id) ON DELETE CASCADE,
  account_code text NOT NULL,
  debit numeric NOT NULL DEFAULT 0,
  credit numeric NOT NULL DEFAULT 0,
  description text,
  line_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_einvoice_journal_draft_lines_draft ON public.einvoice_journal_draft_lines(draft_id);

ALTER TABLE public.einvoice_journal_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.einvoice_journal_draft_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant members read drafts"
  ON public.einvoice_journal_drafts FOR SELECT
  USING (public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "tenant members insert drafts"
  ON public.einvoice_journal_drafts FOR INSERT
  WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "tenant members update drafts"
  ON public.einvoice_journal_drafts FOR UPDATE
  USING (public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "tenant members delete drafts"
  ON public.einvoice_journal_drafts FOR DELETE
  USING (public.is_tenant_member(auth.uid(), tenant_id));

CREATE POLICY "tenant members read draft lines"
  ON public.einvoice_journal_draft_lines FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.einvoice_journal_drafts d
    WHERE d.id = draft_id AND public.is_tenant_member(auth.uid(), d.tenant_id)
  ));
CREATE POLICY "tenant members write draft lines"
  ON public.einvoice_journal_draft_lines FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.einvoice_journal_drafts d
    WHERE d.id = draft_id AND public.is_tenant_member(auth.uid(), d.tenant_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.einvoice_journal_drafts d
    WHERE d.id = draft_id AND public.is_tenant_member(auth.uid(), d.tenant_id)
  ));

CREATE TRIGGER trg_einvoice_journal_drafts_updated_at
  BEFORE UPDATE ON public.einvoice_journal_drafts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
