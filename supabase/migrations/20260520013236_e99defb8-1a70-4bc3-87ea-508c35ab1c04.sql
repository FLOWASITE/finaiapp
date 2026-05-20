-- Add status column
ALTER TABLE public.ai_uploads
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'parsing';

-- Deduplicate existing rows: keep oldest per (user_id, file_hash, kind)
DELETE FROM public.ai_uploads a
USING public.ai_uploads b
WHERE a.user_id = b.user_id
  AND a.file_hash = b.file_hash
  AND a.kind = b.kind
  AND a.file_hash IS NOT NULL
  AND a.created_at > b.created_at;

-- Unique index for upsert
CREATE UNIQUE INDEX IF NOT EXISTS ai_uploads_user_hash_kind_uidx
  ON public.ai_uploads (user_id, file_hash, kind)
  WHERE file_hash IS NOT NULL;