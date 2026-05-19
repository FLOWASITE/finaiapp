ALTER TABLE public.user_digest_prefs
  ADD COLUMN IF NOT EXISTS template text NOT NULL DEFAULT 'standard'
  CHECK (template IN ('short','standard','detailed'));