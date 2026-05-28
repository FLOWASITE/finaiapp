
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS inventory_account TEXT,
  ADD COLUMN IF NOT EXISTS asset_account     TEXT,
  ADD COLUMN IF NOT EXISTS prepaid_account   TEXT;

-- Backfill từ stock_account hiện có theo item_type
UPDATE public.products
SET inventory_account = COALESCE(inventory_account, stock_account, '152')
WHERE item_type = 'material';

UPDATE public.products
SET inventory_account = COALESCE(inventory_account, stock_account, '153')
WHERE item_type = 'ccdc';

UPDATE public.products
SET inventory_account = COALESCE(inventory_account, stock_account, '156')
WHERE item_type IN ('goods', 'combo');

UPDATE public.products
SET asset_account = COALESCE(asset_account, stock_account, '211')
WHERE item_type = 'fixed_asset';

UPDATE public.products
SET prepaid_account = COALESCE(prepaid_account, stock_account, '242')
WHERE item_type = 'prepaid';

COMMENT ON COLUMN public.products.inventory_account IS 'TK kho: 152 NVL / 153 CCDC / 156 hàng hoá / 155 thành phẩm';
COMMENT ON COLUMN public.products.asset_account     IS 'TK TSCĐ: 211 hữu hình / 213 vô hình';
COMMENT ON COLUMN public.products.prepaid_account   IS 'TK chờ phân bổ: 242';
COMMENT ON COLUMN public.products.expense_account   IS 'TK chi phí (dịch vụ): 6xx';
COMMENT ON COLUMN public.products.stock_account     IS '[DEPRECATED] giữ tương thích — dùng inventory/asset/prepaid_account';
