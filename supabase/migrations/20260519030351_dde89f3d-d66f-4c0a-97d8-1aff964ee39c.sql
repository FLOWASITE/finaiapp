CREATE TABLE IF NOT EXISTS public.ai_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  file_path text,
  mime_type text,
  filename text,
  kind text NOT NULL DEFAULT 'auto',
  parsed jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_uploads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own ai_uploads select" ON public.ai_uploads
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own ai_uploads insert" ON public.ai_uploads
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own ai_uploads update" ON public.ai_uploads
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "own ai_uploads delete" ON public.ai_uploads
  FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS ai_uploads_user_created_idx
  ON public.ai_uploads (user_id, created_at DESC);