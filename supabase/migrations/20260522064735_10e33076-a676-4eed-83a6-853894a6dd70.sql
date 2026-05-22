
ALTER TABLE public.stock_vouchers
  ADD COLUMN IF NOT EXISTS kind text,
  ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS party_id uuid,
  ADD COLUMN IF NOT EXISTS party_name text,
  ADD COLUMN IF NOT EXISTS party_phone text,
  ADD COLUMN IF NOT EXISTS party_address text,
  ADD COLUMN IF NOT EXISTS deliverer_name text,
  ADD COLUMN IF NOT EXISTS receiver_name text,
  ADD COLUMN IF NOT EXISTS source_doc_no text,
  ADD COLUMN IF NOT EXISTS source_doc_date date,
  ADD COLUMN IF NOT EXISTS transfer_doc_no text,
  ADD COLUMN IF NOT EXISTS attachments_count integer DEFAULT 0;

ALTER TABLE public.stock_movements
  ADD COLUMN IF NOT EXISTS costing_method text;
