CREATE INDEX IF NOT EXISTS idx_ai_uploads_classify_text_hash
  ON public.ai_uploads ((classify_meta->>'text_hash'))
  WHERE classify_meta ? 'text_hash';