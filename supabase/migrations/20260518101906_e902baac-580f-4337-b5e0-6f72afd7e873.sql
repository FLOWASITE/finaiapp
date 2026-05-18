
CREATE TABLE IF NOT EXISTS public.product_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  tenant_id uuid,
  code text NOT NULL,
  name text NOT NULL,
  note text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS product_units_tenant_code_uq
  ON public.product_units (tenant_id, lower(code)) WHERE tenant_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS product_units_user_code_uq
  ON public.product_units (user_id, lower(code)) WHERE tenant_id IS NULL;
ALTER TABLE public.product_units ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own product_units all" ON public.product_units
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "tenant product_units select" ON public.product_units
  FOR SELECT USING (tenant_id IS NOT NULL AND is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "tenant product_units insert" ON public.product_units
  FOR INSERT WITH CHECK (tenant_id IS NOT NULL AND tenant_id = current_tenant_id()
    AND has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin','accountant']));
CREATE POLICY "tenant product_units update" ON public.product_units
  FOR UPDATE USING (tenant_id IS NOT NULL AND has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin','accountant']))
  WITH CHECK (tenant_id IS NOT NULL AND has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin','accountant']));
CREATE POLICY "tenant product_units delete" ON public.product_units
  FOR DELETE USING (tenant_id IS NOT NULL AND has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin','accountant']));
CREATE TRIGGER product_units_set_updated_at
  BEFORE UPDATE ON public.product_units FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
