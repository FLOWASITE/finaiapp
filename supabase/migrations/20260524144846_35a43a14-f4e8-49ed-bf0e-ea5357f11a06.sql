
-- Bảng cấu hình AI model theo từng Agent
CREATE TABLE public.ai_agent_models (
  agent_key text PRIMARY KEY,
  label text NOT NULL,
  description text,
  purpose text NOT NULL,
  model_name text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

ALTER TABLE public.ai_agent_models ENABLE ROW LEVEL SECURITY;

-- Chỉ superadmin (has_role) đọc/ghi. Dùng hàm has_role có sẵn nếu có; fallback an toàn.
CREATE POLICY "superadmin read ai_agent_models"
  ON public.ai_agent_models FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'superadmin'));

CREATE POLICY "superadmin write ai_agent_models"
  ON public.ai_agent_models FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'superadmin'))
  WITH CHECK (public.has_role(auth.uid(), 'superadmin'));

-- Seed 10 agent (model_name NULL = kế thừa purpose mặc định)
INSERT INTO public.ai_agent_models (agent_key, label, description, purpose, model_name) VALUES
  ('categorize_purchase', 'Categorize – Mua vào', 'Đề xuất bút toán cho hoá đơn mua vào', 'reasoning', NULL),
  ('categorize_sales',    'Categorize – Bán ra',  'Đề xuất bút toán cho hoá đơn bán ra',  'reasoning', NULL),
  ('inbox_reason',        'Inbox AI',             'Giải thích & gợi ý xử lý inbox',       'reasoning', NULL),
  ('bank_reconcile',      'Bank Reconcile',       'Gợi ý đối soát giao dịch ngân hàng',   'reasoning', NULL),
  ('journal',             'Journal AI',           'Soạn bút toán thủ công',               'reasoning', NULL),
  ('parse_doc_vision',    'Parse Document – Vision', 'Đọc PDF / ảnh / hoá đơn scan',      'parse',     NULL),
  ('parse_doc_text',      'Parse Document – Text',   'Đọc tài liệu text / markdown',     'parse',     NULL),
  ('invoice_extract',     'Invoice Extract',      'Trích xuất thông tin hoá đơn',         'parse',     NULL),
  ('classify_file',       'Classify File',        'Phân loại file người dùng upload',     'classify',  NULL),
  ('chat',                'Chat – Trợ lý KTV',    'Trợ lý kế toán viên',                  'chat',      NULL);
