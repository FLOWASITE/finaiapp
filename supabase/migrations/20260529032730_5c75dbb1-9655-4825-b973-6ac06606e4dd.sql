
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS canonical_path text;

CREATE INDEX IF NOT EXISTS idx_documents_tier_created
  ON public.documents (storage_tier, created_at)
  WHERE archived_at IS NULL;
