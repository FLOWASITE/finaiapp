ALTER TABLE public.ai_agent_activity_logs REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.ai_agent_activity_logs;