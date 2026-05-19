ALTER TABLE public.chat_threads
  ADD COLUMN IF NOT EXISTS inbox_external_id text,
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'general';

CREATE UNIQUE INDEX IF NOT EXISTS chat_threads_inbox_unique
  ON public.chat_threads(tenant_id, user_id, inbox_external_id)
  WHERE inbox_external_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS chat_threads_kind_idx
  ON public.chat_threads(tenant_id, user_id, kind);