ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS item_type text NOT NULL DEFAULT 'goods'
  CHECK (item_type IN ('goods','service','combo'));
CREATE INDEX IF NOT EXISTS idx_products_item_type ON public.products(item_type);