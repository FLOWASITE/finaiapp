-- Multi-line stock vouchers
CREATE TABLE public.stock_vouchers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  tenant_id uuid,
  voucher_no text NOT NULL,
  voucher_type text NOT NULL CHECK (voucher_type IN ('in','out')),
  voucher_date date NOT NULL DEFAULT CURRENT_DATE,
  warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE SET NULL,
  counter_account text NOT NULL,
  reason text,
  journal_entry_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_stock_vouchers_tenant_date ON public.stock_vouchers (tenant_id, voucher_date DESC);
CREATE INDEX idx_stock_vouchers_user_date ON public.stock_vouchers (user_id, voucher_date DESC);
CREATE INDEX idx_stock_vouchers_type_no ON public.stock_vouchers (voucher_type, voucher_no);

ALTER TABLE public.stock_vouchers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own stock_vouchers all" ON public.stock_vouchers
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "tenant stock_vouchers select" ON public.stock_vouchers
  FOR SELECT USING ((tenant_id IS NOT NULL) AND is_tenant_member(auth.uid(), tenant_id));

CREATE POLICY "tenant stock_vouchers insert" ON public.stock_vouchers
  FOR INSERT WITH CHECK ((tenant_id IS NOT NULL) AND (tenant_id = current_tenant_id()) AND has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin','accountant']));

CREATE POLICY "tenant stock_vouchers update" ON public.stock_vouchers
  FOR UPDATE USING ((tenant_id IS NOT NULL) AND has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin','accountant']))
  WITH CHECK ((tenant_id IS NOT NULL) AND has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin','accountant']));

CREATE POLICY "tenant stock_vouchers delete" ON public.stock_vouchers
  FOR DELETE USING ((tenant_id IS NOT NULL) AND has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin','accountant']));

-- Link movements to voucher header (nullable: existing rows + sales/stock-take movements remain unlinked)
ALTER TABLE public.stock_movements
  ADD COLUMN voucher_id uuid REFERENCES public.stock_vouchers(id) ON DELETE CASCADE;

CREATE INDEX idx_stock_movements_voucher ON public.stock_movements (voucher_id);
