ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS can_be_sold boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS can_be_purchased boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS expense_account text;

UPDATE public.products
  SET expense_account = '642'
  WHERE item_type = 'service' AND (expense_account IS NULL OR expense_account = '');

CREATE INDEX IF NOT EXISTS idx_products_can_be_sold ON public.products(can_be_sold) WHERE can_be_sold = true;
CREATE INDEX IF NOT EXISTS idx_products_can_be_purchased ON public.products(can_be_purchased) WHERE can_be_purchased = true;