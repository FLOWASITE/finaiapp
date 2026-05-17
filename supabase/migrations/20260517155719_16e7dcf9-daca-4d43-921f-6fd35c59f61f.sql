
-- product_categories
CREATE TABLE public.product_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  tenant_id uuid,
  name text NOT NULL,
  parent_id uuid REFERENCES public.product_categories(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.product_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own product_categories all" ON public.product_categories
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "tenant product_categories select" ON public.product_categories
  FOR SELECT USING (tenant_id IS NOT NULL AND is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "tenant product_categories insert" ON public.product_categories
  FOR INSERT WITH CHECK (tenant_id IS NOT NULL AND tenant_id = current_tenant_id()
    AND has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin','accountant']));
CREATE POLICY "tenant product_categories update" ON public.product_categories
  FOR UPDATE USING (tenant_id IS NOT NULL AND has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin','accountant']))
  WITH CHECK (tenant_id IS NOT NULL AND has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin','accountant']));
CREATE POLICY "tenant product_categories delete" ON public.product_categories
  FOR DELETE USING (tenant_id IS NOT NULL AND has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin','accountant']));

-- products extend
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES public.product_categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS barcode text,
  ADD COLUMN IF NOT EXISTS min_stock numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_stock numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notes text;

-- stock_takes
CREATE TABLE public.stock_takes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  tenant_id uuid,
  code text NOT NULL,
  take_date date NOT NULL DEFAULT CURRENT_DATE,
  warehouse text,
  status text NOT NULL DEFAULT 'draft',
  notes text,
  journal_entry_id uuid,
  posted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.stock_takes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own stock_takes all" ON public.stock_takes
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "tenant stock_takes select" ON public.stock_takes
  FOR SELECT USING (tenant_id IS NOT NULL AND is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "tenant stock_takes insert" ON public.stock_takes
  FOR INSERT WITH CHECK (tenant_id IS NOT NULL AND tenant_id = current_tenant_id()
    AND has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin','accountant']));
CREATE POLICY "tenant stock_takes update" ON public.stock_takes
  FOR UPDATE USING (tenant_id IS NOT NULL AND has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin','accountant']))
  WITH CHECK (tenant_id IS NOT NULL AND has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin','accountant']));
CREATE POLICY "tenant stock_takes delete" ON public.stock_takes
  FOR DELETE USING (tenant_id IS NOT NULL AND has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin','accountant']));

-- stock_take_lines
CREATE TABLE public.stock_take_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_take_id uuid NOT NULL REFERENCES public.stock_takes(id) ON DELETE CASCADE,
  product_id uuid NOT NULL,
  system_qty numeric NOT NULL DEFAULT 0,
  counted_qty numeric NOT NULL DEFAULT 0,
  diff_qty numeric NOT NULL DEFAULT 0,
  unit_cost numeric NOT NULL DEFAULT 0,
  diff_value numeric NOT NULL DEFAULT 0,
  note text
);
ALTER TABLE public.stock_take_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own stock_take_lines all" ON public.stock_take_lines
  FOR ALL USING (EXISTS (SELECT 1 FROM public.stock_takes s WHERE s.id = stock_take_lines.stock_take_id AND s.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.stock_takes s WHERE s.id = stock_take_lines.stock_take_id AND s.user_id = auth.uid()));

CREATE INDEX idx_stock_take_lines_take ON public.stock_take_lines(stock_take_id);
CREATE INDEX idx_products_category ON public.products(category_id);
CREATE INDEX idx_stock_movements_product_date ON public.stock_movements(product_id, movement_date DESC);
