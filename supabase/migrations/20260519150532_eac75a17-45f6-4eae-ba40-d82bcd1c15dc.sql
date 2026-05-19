ALTER TABLE public.chat_threads
  ADD COLUMN IF NOT EXISTS pinned_at timestamptz,
  ADD COLUMN IF NOT EXISTS starred boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_chat_threads_pinned
  ON public.chat_threads (user_id, tenant_id, pinned_at DESC NULLS LAST, last_message_at DESC);

CREATE INDEX IF NOT EXISTS idx_chat_threads_starred
  ON public.chat_threads (user_id, tenant_id, starred) WHERE starred = true;