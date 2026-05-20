ALTER TABLE public.einvoices
  ADD COLUMN IF NOT EXISTS xml_fetch_status text NOT NULL DEFAULT 'not_needed',
  ADD COLUMN IF NOT EXISTS xml_fetch_error text,
  ADD COLUMN IF NOT EXISTS xml_fetched_at timestamp with time zone;

ALTER TABLE public.einvoices
  DROP CONSTRAINT IF EXISTS einvoices_xml_fetch_status_check;

ALTER TABLE public.einvoices
  ADD CONSTRAINT einvoices_xml_fetch_status_check
  CHECK (xml_fetch_status = ANY (ARRAY['not_needed'::text, 'pending'::text, 'done'::text, 'failed'::text]));

CREATE INDEX IF NOT EXISTS idx_einvoices_xml_fetch_pending
  ON public.einvoices (tenant_id, xml_fetch_status)
  WHERE xml_fetch_status = ANY (ARRAY['pending'::text, 'failed'::text]);
