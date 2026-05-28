CREATE OR REPLACE FUNCTION public.bump_rule_metrics(_rule_id uuid, _correct boolean DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.ai_memory_rules
  SET applied_count = applied_count + 1,
      accuracy_total = accuracy_total + CASE WHEN _correct IS NULL THEN 0 ELSE 1 END,
      accuracy_correct = accuracy_correct + CASE WHEN _correct = TRUE THEN 1 ELSE 0 END,
      last_used_at = now(),
      updated_at = now()
  WHERE id = _rule_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.bump_rule_metrics(uuid, boolean) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.record_rule_outcome(_application_id uuid, _correct boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rule_id uuid;
BEGIN
  SELECT rule_id INTO v_rule_id FROM public.ai_rule_applications WHERE id = _application_id;
  IF v_rule_id IS NULL THEN RETURN; END IF;
  UPDATE public.ai_memory_rules
  SET accuracy_total = accuracy_total + 1,
      accuracy_correct = accuracy_correct + CASE WHEN _correct THEN 1 ELSE 0 END,
      updated_at = now()
  WHERE id = v_rule_id;

  -- Auto downgrade rule mode if accuracy < 60% with ≥10 samples
  UPDATE public.ai_memory_rules
  SET mode = 'suggest',
      paused_reason = COALESCE(paused_reason, 'Tự động chuyển sang gợi ý do độ chính xác thấp')
  WHERE id = v_rule_id
    AND mode = 'auto'
    AND accuracy_total >= 10
    AND (accuracy_correct::numeric / accuracy_total) < 0.6;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_rule_outcome(uuid, boolean) TO authenticated, service_role;