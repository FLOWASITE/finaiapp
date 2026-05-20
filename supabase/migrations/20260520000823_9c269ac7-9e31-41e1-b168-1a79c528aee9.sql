
-- Observability columns
ALTER TABLE public.ai_uploads
  ADD COLUMN IF NOT EXISTS parser_used text,
  ADD COLUMN IF NOT EXISTS parser_ms integer,
  ADD COLUMN IF NOT EXISTS structurer_ms integer,
  ADD COLUMN IF NOT EXISTS pages integer,
  ADD COLUMN IF NOT EXISTS file_hash text;

CREATE INDEX IF NOT EXISTS ai_uploads_hash_idx ON public.ai_uploads(file_hash);

-- Cache table: (hash, kind) -> parsed JSON
CREATE TABLE IF NOT EXISTS public.ai_parse_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_hash text NOT NULL,
  kind text NOT NULL,
  parsed jsonb NOT NULL,
  parser_used text,
  pages integer,
  hit_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_hit_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(file_hash, kind)
);

ALTER TABLE public.ai_parse_cache ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read (cache is non-sensitive parsed JSON, scoped by hash they must already possess)
CREATE POLICY "auth read ai_parse_cache"
  ON public.ai_parse_cache FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "auth insert ai_parse_cache"
  ON public.ai_parse_cache FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "auth update ai_parse_cache"
  ON public.ai_parse_cache FOR UPDATE
  TO authenticated
  USING (true);
