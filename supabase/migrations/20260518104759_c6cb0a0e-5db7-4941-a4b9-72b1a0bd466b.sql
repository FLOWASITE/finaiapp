-- Customer groups
CREATE TABLE public.customer_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  tenant_id uuid,
  parent_id uuid REFERENCES public.customer_groups(id) ON DELETE SET NULL,
  code text,
  name text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX customer_groups_user_code_uniq ON public.customer_groups(user_id, code) WHERE code IS NOT NULL;
CREATE INDEX idx_customer_groups_tenant_id ON public.customer_groups(tenant_id);

ALTER TABLE public.customer_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own customer_groups all" ON public.customer_groups
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "tenant customer_groups select" ON public.customer_groups
  FOR SELECT USING ((tenant_id IS NOT NULL) AND is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "tenant customer_groups insert" ON public.customer_groups
  FOR INSERT WITH CHECK ((tenant_id IS NOT NULL) AND (tenant_id = current_tenant_id())
    AND has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin','accountant']));
CREATE POLICY "tenant customer_groups update" ON public.customer_groups
  FOR UPDATE USING ((tenant_id IS NOT NULL) AND has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin','accountant']))
  WITH CHECK ((tenant_id IS NOT NULL) AND has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin','accountant']));
CREATE POLICY "tenant customer_groups delete" ON public.customer_groups
  FOR DELETE USING ((tenant_id IS NOT NULL) AND has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin','accountant']));

CREATE TRIGGER set_updated_at_customer_groups BEFORE UPDATE ON public.customer_groups
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Supplier groups
CREATE TABLE public.supplier_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  tenant_id uuid,
  parent_id uuid REFERENCES public.supplier_groups(id) ON DELETE SET NULL,
  code text,
  name text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX supplier_groups_user_code_uniq ON public.supplier_groups(user_id, code) WHERE code IS NOT NULL;
CREATE INDEX idx_supplier_groups_tenant_id ON public.supplier_groups(tenant_id);

ALTER TABLE public.supplier_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own supplier_groups all" ON public.supplier_groups
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "tenant supplier_groups select" ON public.supplier_groups
  FOR SELECT USING ((tenant_id IS NOT NULL) AND is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "tenant supplier_groups insert" ON public.supplier_groups
  FOR INSERT WITH CHECK ((tenant_id IS NOT NULL) AND (tenant_id = current_tenant_id())
    AND has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin','accountant']));
CREATE POLICY "tenant supplier_groups update" ON public.supplier_groups
  FOR UPDATE USING ((tenant_id IS NOT NULL) AND has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin','accountant']))
  WITH CHECK ((tenant_id IS NOT NULL) AND has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin','accountant']));
CREATE POLICY "tenant supplier_groups delete" ON public.supplier_groups
  FOR DELETE USING ((tenant_id IS NOT NULL) AND has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin','accountant']));

CREATE TRIGGER set_updated_at_supplier_groups BEFORE UPDATE ON public.supplier_groups
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Add group_id columns
ALTER TABLE public.customers ADD COLUMN group_id uuid REFERENCES public.customer_groups(id) ON DELETE SET NULL;
CREATE INDEX idx_customers_group_id ON public.customers(group_id);

ALTER TABLE public.suppliers ADD COLUMN group_id uuid REFERENCES public.supplier_groups(id) ON DELETE SET NULL;
CREATE INDEX idx_suppliers_group_id ON public.suppliers(group_id);