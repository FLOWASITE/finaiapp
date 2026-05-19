
CREATE OR REPLACE FUNCTION public.tg_ai_rule_applications_stats()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.ai_memory_rules
    SET applied_count = applied_count + 1,
        accuracy_total = accuracy_total + 1,
        accuracy_correct = accuracy_correct + 1,
        last_used_at = GREATEST(COALESCE(last_used_at, NEW.applied_at), NEW.applied_at)
    WHERE id = NEW.rule_id;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Chuyển từ applied -> undone: giảm count và đánh dấu "AI đoán sai"
    IF OLD.status = 'applied' AND NEW.status = 'undone' THEN
      UPDATE public.ai_memory_rules
      SET applied_count = GREATEST(0, applied_count - 1),
          accuracy_correct = GREATEST(0, accuracy_correct - 1)
      WHERE id = NEW.rule_id;
    -- Khôi phục: undone -> applied
    ELSIF OLD.status = 'undone' AND NEW.status = 'applied' THEN
      UPDATE public.ai_memory_rules
      SET applied_count = applied_count + 1,
          accuracy_correct = accuracy_correct + 1,
          last_used_at = GREATEST(COALESCE(last_used_at, now()), now())
      WHERE id = NEW.rule_id;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.status = 'applied' THEN
      UPDATE public.ai_memory_rules
      SET applied_count = GREATEST(0, applied_count - 1),
          accuracy_total = GREATEST(0, accuracy_total - 1),
          accuracy_correct = GREATEST(0, accuracy_correct - 1)
      WHERE id = OLD.rule_id;
    END IF;
    RETURN OLD;
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS ai_rule_applications_stats_trg ON public.ai_rule_applications;
CREATE TRIGGER ai_rule_applications_stats_trg
AFTER INSERT OR UPDATE OR DELETE ON public.ai_rule_applications
FOR EACH ROW EXECUTE FUNCTION public.tg_ai_rule_applications_stats();

-- Đồng bộ lại con số cho dữ liệu hiện có (dựa trên lịch sử thật)
WITH agg AS (
  SELECT
    rule_id,
    COUNT(*) FILTER (WHERE status = 'applied') AS applied,
    COUNT(*) AS total,
    MAX(applied_at) FILTER (WHERE status = 'applied') AS last_at
  FROM public.ai_rule_applications
  GROUP BY rule_id
)
UPDATE public.ai_memory_rules r
SET applied_count = a.applied,
    accuracy_total = a.total,
    accuracy_correct = a.applied,
    last_used_at = a.last_at
FROM agg a
WHERE r.id = a.rule_id;

-- Bật realtime
ALTER TABLE public.ai_memory_rules REPLICA IDENTITY FULL;
ALTER TABLE public.ai_rule_applications REPLICA IDENTITY FULL;

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.ai_memory_rules;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.ai_rule_applications;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;
