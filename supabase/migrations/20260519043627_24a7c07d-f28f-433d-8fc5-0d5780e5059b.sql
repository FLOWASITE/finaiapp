-- Chat threads & messages for ChatGPT-like AI assistant UI
CREATE TABLE public.chat_threads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL,
  user_id UUID NOT NULL,
  title TEXT NOT NULL DEFAULT 'Cuộc trò chuyện mới',
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_chat_threads_tenant_user ON public.chat_threads(tenant_id, user_id, last_message_at DESC);

ALTER TABLE public.chat_threads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own threads in tenant"
  ON public.chat_threads FOR SELECT
  USING (auth.uid() = user_id AND tenant_id = public.current_tenant_id());

CREATE POLICY "Users insert own threads in tenant"
  ON public.chat_threads FOR INSERT
  WITH CHECK (auth.uid() = user_id AND tenant_id = public.current_tenant_id());

CREATE POLICY "Users update own threads"
  ON public.chat_threads FOR UPDATE
  USING (auth.uid() = user_id AND tenant_id = public.current_tenant_id());

CREATE POLICY "Users delete own threads"
  ON public.chat_threads FOR DELETE
  USING (auth.uid() = user_id AND tenant_id = public.current_tenant_id());

CREATE TRIGGER trg_chat_threads_updated_at
  BEFORE UPDATE ON public.chat_threads
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.chat_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  thread_id UUID NOT NULL REFERENCES public.chat_threads(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL,
  user_id UUID NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user','assistant','system')),
  content TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_chat_messages_thread ON public.chat_messages(thread_id, created_at);

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own messages in tenant"
  ON public.chat_messages FOR SELECT
  USING (auth.uid() = user_id AND tenant_id = public.current_tenant_id());

CREATE POLICY "Users insert own messages in tenant"
  ON public.chat_messages FOR INSERT
  WITH CHECK (auth.uid() = user_id AND tenant_id = public.current_tenant_id());

CREATE POLICY "Users delete own messages"
  ON public.chat_messages FOR DELETE
  USING (auth.uid() = user_id AND tenant_id = public.current_tenant_id());
