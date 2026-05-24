ALTER TABLE public.ai_agent_models ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

INSERT INTO public.ai_agent_models (agent_key, label, description, purpose, model_name, is_active) VALUES
  ('categorize_purchase', 'Categorize – Mua vào', 'Đề xuất bút toán cho hoá đơn/chứng từ mua vào', 'reasoning', NULL, false),
  ('categorize_sales', 'Categorize – Bán ra', 'Đề xuất bút toán cho hoá đơn/chứng từ bán ra', 'reasoning', NULL, false),
  ('inbox_reason', 'Inbox Reason', 'Giải thích lý do AI gợi ý trong Inbox', 'reasoning', NULL, false)
ON CONFLICT (agent_key) DO NOTHING;