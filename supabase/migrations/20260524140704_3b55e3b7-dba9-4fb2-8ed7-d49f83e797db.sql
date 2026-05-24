-- Allow ai_journal_proposals to reference either purchase or sales invoices
ALTER TABLE public.ai_journal_proposals
  DROP CONSTRAINT IF EXISTS ai_journal_proposals_invoice_id_fkey;

ALTER TABLE public.ai_journal_proposals
  ADD COLUMN IF NOT EXISTS invoice_kind text NOT NULL DEFAULT 'purchase'
  CHECK (invoice_kind IN ('purchase','sales'));

-- Replace unique(invoice_id) with composite unique to allow same UUID across kinds
ALTER TABLE public.ai_journal_proposals
  DROP CONSTRAINT IF EXISTS ai_journal_proposals_invoice_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS ai_journal_proposals_kind_invoice_uq
  ON public.ai_journal_proposals (invoice_kind, invoice_id);

CREATE INDEX IF NOT EXISTS ai_journal_proposals_tenant_kind_status_idx
  ON public.ai_journal_proposals (tenant_id, invoice_kind, status, created_at DESC);