
-- Unit conversions table: per-product alternate units relative to the product's base unit.
CREATE TABLE IF NOT EXISTS public.product_unit_conversions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  tenant_id uuid,
  product_id uuid NOT NULL,
  unit text NOT NULL,
  factor numeric NOT NULL CHECK (factor > 0),
  is_default_purchase boolean NOT NULL DEFAULT false,
  is_default_sale boolean NOT NULL DEFAULT false,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, unit)
);

CREATE INDEX IF NOT EXISTS product_unit_conversions_product_idx
  ON public.product_unit_conversions (product_id);

ALTER TABLE public.product_unit_conversions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own puc all" ON public.product_unit_conversions
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "tenant puc select" ON public.product_unit_conversions
  FOR SELECT USING ((tenant_id IS NOT NULL) AND is_tenant_member(auth.uid(), tenant_id));

CREATE POLICY "tenant puc insert" ON public.product_unit_conversions
  FOR INSERT WITH CHECK (
    (tenant_id IS NOT NULL) AND (tenant_id = current_tenant_id())
    AND has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin','accountant'])
  );

CREATE POLICY "tenant puc update" ON public.product_unit_conversions
  FOR UPDATE USING (
    (tenant_id IS NOT NULL) AND has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin','accountant'])
  ) WITH CHECK (
    (tenant_id IS NOT NULL) AND has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin','accountant'])
  );

CREATE POLICY "tenant puc delete" ON public.product_unit_conversions
  FOR DELETE USING (
    (tenant_id IS NOT NULL) AND has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin','accountant'])
  );

CREATE TRIGGER puc_set_updated_at
  BEFORE UPDATE ON public.product_unit_conversions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Track the transaction-time unit on each stock movement so we can display/print
-- the voucher in the unit it was originally entered.
ALTER TABLE public.stock_movements
  ADD COLUMN IF NOT EXISTS txn_unit text,
  ADD COLUMN IF NOT EXISTS txn_qty numeric,
  ADD COLUMN IF NOT EXISTS txn_unit_cost numeric,
  ADD COLUMN IF NOT EXISTS conversion_factor numeric NOT NULL DEFAULT 1;
