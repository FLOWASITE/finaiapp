
-- ============ ai_memory_partners ============
CREATE TABLE public.ai_memory_partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  party_kind text NOT NULL CHECK (party_kind IN ('customer','supplier','employee','individual')),
  party_id uuid,
  display_name text NOT NULL,
  behavior_text text NOT NULL,
  tags text[] NOT NULL DEFAULT '{}',
  default_account text,
  default_dept_id uuid,
  default_project_id uuid,
  memo_keywords text[] NOT NULL DEFAULT '{}',
  bank_hints text[] NOT NULL DEFAULT '{}',
  confidence numeric NOT NULL DEFAULT 0.5,
  sample_count integer NOT NULL DEFAULT 0,
  last_seen_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ai_memory_partners_tenant_idx ON public.ai_memory_partners(tenant_id, party_kind);
CREATE INDEX ai_memory_partners_name_idx ON public.ai_memory_partners(tenant_id, lower(display_name));
ALTER TABLE public.ai_memory_partners ENABLE ROW LEVEL SECURITY;

CREATE POLICY "partners_select" ON public.ai_memory_partners FOR SELECT
  USING (public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "partners_write" ON public.ai_memory_partners FOR ALL
  USING (public.has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin','accountant']))
  WITH CHECK (public.has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin','accountant']));

CREATE TRIGGER set_updated_at_partners BEFORE UPDATE ON public.ai_memory_partners
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ ai_memory_context ============
CREATE TABLE public.ai_memory_context (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  category text NOT NULL CHECK (category IN ('org','accounting','tax','revenue','banking','departments','business_model','einvoice','other')),
  key text NOT NULL,
  label text NOT NULL,
  value_text text NOT NULL,
  value_json jsonb,
  order_index integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, category, key)
);
CREATE INDEX ai_memory_context_tenant_idx ON public.ai_memory_context(tenant_id, category, order_index);
ALTER TABLE public.ai_memory_context ENABLE ROW LEVEL SECURITY;

CREATE POLICY "context_select" ON public.ai_memory_context FOR SELECT
  USING (public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "context_write" ON public.ai_memory_context FOR ALL
  USING (public.has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin','accountant']))
  WITH CHECK (public.has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin','accountant']));

CREATE TRIGGER set_updated_at_context BEFORE UPDATE ON public.ai_memory_context
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ ai_memory_limits ============
CREATE TABLE public.ai_memory_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  code text NOT NULL,
  title text NOT NULL,
  rule_text text NOT NULL,
  limit_kind text NOT NULL CHECK (limit_kind IN ('block','warn','require_review')),
  scope text NOT NULL CHECK (scope IN ('amount','vendor','account','category','variance','cash','custom')),
  params jsonb NOT NULL DEFAULT '{}'::jsonb,
  severity text NOT NULL DEFAULT 'med' CHECK (severity IN ('low','med','high')),
  is_active boolean NOT NULL DEFAULT true,
  triggered_count integer NOT NULL DEFAULT 0,
  last_triggered_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);
CREATE INDEX ai_memory_limits_tenant_idx ON public.ai_memory_limits(tenant_id, is_active);
ALTER TABLE public.ai_memory_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "limits_select" ON public.ai_memory_limits FOR SELECT
  USING (public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "limits_write" ON public.ai_memory_limits FOR ALL
  USING (public.has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin','accountant']))
  WITH CHECK (public.has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin','accountant']));

CREATE TRIGGER set_updated_at_limits BEFORE UPDATE ON public.ai_memory_limits
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ Mở rộng ai_rule_applications ============
ALTER TABLE public.ai_rule_applications
  ADD COLUMN IF NOT EXISTS source_kind text NOT NULL DEFAULT 'rule'
    CHECK (source_kind IN ('rule','partner','context','limit')),
  ADD COLUMN IF NOT EXISTS source_id uuid;
CREATE INDEX IF NOT EXISTS ai_rule_apps_source_idx
  ON public.ai_rule_applications(tenant_id, source_kind, source_id, applied_at DESC);

-- Backfill source_id từ rule_id cho dữ liệu cũ
UPDATE public.ai_rule_applications SET source_id = rule_id WHERE source_id IS NULL;

-- ============ Seed mặc định cho mọi tenant ============
-- 12 mục Bối cảnh DN
INSERT INTO public.ai_memory_context (tenant_id, category, key, label, value_text, order_index)
SELECT t.id, x.category, x.key, x.label, x.value_text, x.order_index
FROM public.tenants t
CROSS JOIN (VALUES
  ('org',           'company_type',    'Loại hình',         'Công ty cổ phần',                                   1),
  ('org',           'industry',        'Ngành',             'Chưa cấu hình — vui lòng cập nhật',                 2),
  ('accounting',    'standard',        'Chuẩn mực',         'VAS (Việt Nam) — không phải IFRS',                  3),
  ('accounting',    'fiscal_year',     'Năm tài chính',     '1/1 - 31/12, kỳ kế toán tháng',                     4),
  ('accounting',    'currency',        'Đơn vị tiền tệ',    'VND là chính; ngoại tệ dùng TK 1122 + tỷ giá NHNN', 5),
  ('revenue',       'segments',        'Mảng doanh thu',    'Chưa phân mảng — mặc định gộp vào TK 511',          6),
  ('tax',           'vat',             'Thuế GTGT',         'Khai theo quý',                                     7),
  ('tax',           'cit',             'Thuế TNDN',         'Tạm nộp theo quý, quyết toán cuối năm',             8),
  ('einvoice',      'provider',        'HĐ điện tử',        'Chưa cấu hình nhà cung cấp',                        9),
  ('banking',       'main_bank',       'Ngân hàng chính',   'Chưa cấu hình',                                    10),
  ('departments',   'structure',       'Phòng ban',         'Chưa cấu hình cơ cấu phòng ban',                   11),
  ('business_model','revenue_recog',   'Mô hình ghi nhận', 'Ghi nhận doanh thu khi xuất hoá đơn (mặc định)',   12)
) AS x(category, key, label, value_text, order_index)
ON CONFLICT (tenant_id, category, key) DO NOTHING;

-- 8 giới hạn mặc định
INSERT INTO public.ai_memory_limits (tenant_id, code, title, rule_text, limit_kind, scope, params, severity)
SELECT t.id, x.code, x.title, x.rule_text, x.limit_kind, x.scope, x.params::jsonb, x.severity
FROM public.tenants t
CROSS JOIN (VALUES
  ('amount_50m',      'Số tiền lớn',           'KHÔNG tự duyệt bút toán vượt 50.000.000 ₫',                          'require_review', 'amount',   '{"amount_gt": 50000000}',       'high'),
  ('personal_10m',    'Chuyển cá nhân',        'CẢNH BÁO khi chuyển khoản đến cá nhân vượt 10.000.000 ₫',            'warn',           'vendor',   '{"to_individual": true, "amount_gt": 10000000}', 'high'),
  ('new_vendor',      'Đối tác mới',           'LUÔN đẩy "Cần xem lại" với đối tác chưa có trong danh bạ',          'require_review', 'vendor',   '{"new_vendor": true}',          'med'),
  ('acc_156',         'TK 156 (kho)',          'KHÔNG tự book TK 156 — luôn hỏi (ảnh hưởng giá vốn)',                'require_review', 'account',  '{"account": "156"}',            'high'),
  ('budget_mkt_200',  'Ngân sách Marketing',   'CẢNH BÁO khi chi Marketing trong tháng vượt 200.000.000 ₫',          'warn',           'category', '{"category": "marketing", "monthly_gt": 200000000}', 'med'),
  ('no_delete',       'Không xoá sổ',          'KHÔNG xoá bút toán — chỉ tạo bút toán điều chỉnh',                   'block',          'custom',   '{"forbid": "delete_journal"}',  'high'),
  ('variance_30',     'Biến động doanh thu',   'CẢNH BÁO khi doanh thu lệch ±30% so cùng kỳ năm trước',              'warn',           'variance', '{"metric": "revenue", "pct": 30}', 'med'),
  ('cash_20m',        'Tiền mặt > 20tr',       'Hoá đơn > 20.000.000 ₫ phải có chứng từ không tiền mặt (TT 219)',    'block',           'cash',     '{"amount_gt": 20000000}',       'high')
) AS x(code, title, rule_text, limit_kind, scope, params, severity)
ON CONFLICT (tenant_id, code) DO NOTHING;
