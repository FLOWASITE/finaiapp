
ALTER TABLE public.stock_movements DROP CONSTRAINT IF EXISTS stock_movements_movement_type_check;
ALTER TABLE public.stock_movements ADD CONSTRAINT stock_movements_movement_type_check CHECK (movement_type = ANY (ARRAY['in'::text, 'out'::text, 'transfer'::text]));

ALTER TABLE public.stock_vouchers DROP CONSTRAINT IF EXISTS stock_vouchers_voucher_type_check;
ALTER TABLE public.stock_vouchers ADD CONSTRAINT stock_vouchers_voucher_type_check CHECK (voucher_type = ANY (ARRAY['in'::text, 'out'::text, 'transfer'::text]));

ALTER TABLE public.stock_vouchers ADD COLUMN IF NOT EXISTS target_warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE SET NULL;
