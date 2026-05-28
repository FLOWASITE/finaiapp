ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_item_type_check;
ALTER TABLE public.products ADD CONSTRAINT products_item_type_check
  CHECK (item_type IN ('goods','service','combo','material','ccdc','fixed_asset','prepaid'));

ALTER TABLE public.invoice_lines
  ADD COLUMN IF NOT EXISTS user_override_kind text
    CHECK (user_override_kind IN ('goods','ccdc','asset','service')),
  ADD COLUMN IF NOT EXISTS resolved_kind text
    CHECK (resolved_kind IN ('goods','ccdc','asset','service')),
  ADD COLUMN IF NOT EXISTS resolved_account text,
  ADD COLUMN IF NOT EXISTS resolution_source text
    CHECK (resolution_source IN ('manual','product','classify','none')),
  ADD COLUMN IF NOT EXISTS resolution_confidence numeric(5,2);