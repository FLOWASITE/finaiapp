
-- Lịch sử áp dụng quy tắc AI: mỗi lần hệ thống áp dụng 1 quy tắc cho 1 chứng từ
CREATE TABLE IF NOT EXISTS public.ai_rule_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  rule_id uuid NOT NULL REFERENCES public.ai_memory_rules(id) ON DELETE CASCADE,
  applied_by uuid,
  document_table text,
  document_id uuid,
  document_label text,
  journal_entry_id uuid REFERENCES public.journal_entries(id) ON DELETE SET NULL,
  journal_code text,
  then_snapshot text NOT NULL,
  ai_log jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'applied' CHECK (status IN ('applied','undone')),
  applied_at timestamptz NOT NULL DEFAULT now(),
  undone_at timestamptz,
  undone_by uuid,
  undo_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_rule_applications_rule_idx
  ON public.ai_rule_applications (rule_id, applied_at DESC);
CREATE INDEX IF NOT EXISTS ai_rule_applications_tenant_idx
  ON public.ai_rule_applications (tenant_id, applied_at DESC);

ALTER TABLE public.ai_rule_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_rule_apps_member_select" ON public.ai_rule_applications
  FOR SELECT USING (public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "ai_rule_apps_member_insert" ON public.ai_rule_applications
  FOR INSERT WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "ai_rule_apps_member_update" ON public.ai_rule_applications
  FOR UPDATE USING (public.is_tenant_member(auth.uid(), tenant_id))
  WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "ai_rule_apps_member_delete" ON public.ai_rule_applications
  FOR DELETE USING (public.is_tenant_member(auth.uid(), tenant_id));

-- Seed một vài bản ghi mẫu cho các quy tắc đang hoạt động (để demo, chỉ insert nếu rule chưa có application)
INSERT INTO public.ai_rule_applications
  (tenant_id, rule_id, document_table, document_label, journal_code, then_snapshot, ai_log, applied_at)
SELECT
  r.tenant_id,
  r.id,
  'invoices',
  'CT-' || lpad((1000 + (s.n * 13))::text, 5, '0'),
  'BT-' || lpad((20240 + s.n)::text, 5, '0'),
  r.then_text,
  jsonb_build_object(
    'model', 'google/gemini-2.5-flash',
    'confidence', round((0.82 + (random() * 0.15))::numeric, 3),
    'matched_when', r.when_text,
    'tokens', 320 + floor(random() * 400)::int,
    'latency_ms', 600 + floor(random() * 900)::int
  ),
  now() - (s.n || ' days')::interval
FROM public.ai_memory_rules r
CROSS JOIN generate_series(0, 4) AS s(n)
WHERE r.type = 'active'
  AND r.applied_count > 0
  AND NOT EXISTS (
    SELECT 1 FROM public.ai_rule_applications a WHERE a.rule_id = r.id
  )
  AND s.n < LEAST(r.applied_count, 5);
