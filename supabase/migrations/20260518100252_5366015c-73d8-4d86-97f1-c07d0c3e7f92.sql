
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

CREATE TABLE public.warehouses (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  tenant_id uuid,
  code text NOT NULL,
  name text NOT NULL,
  address text,
  manager text,
  phone text,
  notes text,
  is_default boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX warehouses_tenant_code_idx ON public.warehouses(tenant_id, code) WHERE tenant_id IS NOT NULL;
CREATE UNIQUE INDEX warehouses_user_code_idx ON public.warehouses(user_id, code) WHERE tenant_id IS NULL;
CREATE INDEX warehouses_tenant_idx ON public.warehouses(tenant_id);

ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own warehouses all" ON public.warehouses
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "tenant warehouses select" ON public.warehouses
  FOR SELECT USING (tenant_id IS NOT NULL AND is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "tenant warehouses insert" ON public.warehouses
  FOR INSERT WITH CHECK (
    tenant_id IS NOT NULL AND tenant_id = current_tenant_id()
    AND has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin','accountant'])
  );
CREATE POLICY "tenant warehouses update" ON public.warehouses
  FOR UPDATE USING (
    tenant_id IS NOT NULL AND has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin','accountant'])
  ) WITH CHECK (
    tenant_id IS NOT NULL AND has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin','accountant'])
  );
CREATE POLICY "tenant warehouses delete" ON public.warehouses
  FOR DELETE USING (
    tenant_id IS NOT NULL AND has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin','accountant'])
  );

CREATE TRIGGER warehouses_set_updated_at
  BEFORE UPDATE ON public.warehouses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.stock_movements
  ADD COLUMN warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE SET NULL;
CREATE INDEX stock_movements_warehouse_date_idx
  ON public.stock_movements(warehouse_id, movement_date DESC);

ALTER TABLE public.stock_takes
  ADD COLUMN warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE SET NULL;
CREATE INDEX stock_takes_warehouse_idx ON public.stock_takes(warehouse_id);

INSERT INTO public.warehouses (user_id, tenant_id, code, name, is_default)
SELECT DISTINCT user_id, tenant_id, 'KHO01', 'Kho chính', true
FROM (
  SELECT user_id, tenant_id FROM public.stock_movements
  UNION
  SELECT user_id, tenant_id FROM public.stock_takes
  UNION
  SELECT user_id, tenant_id FROM public.products WHERE on_hand > 0
) src
WHERE NOT EXISTS (
  SELECT 1 FROM public.warehouses w
  WHERE w.user_id = src.user_id
    AND COALESCE(w.tenant_id, '00000000-0000-0000-0000-000000000000'::uuid)
      = COALESCE(src.tenant_id, '00000000-0000-0000-0000-000000000000'::uuid)
);

UPDATE public.stock_movements m
SET warehouse_id = w.id
FROM public.warehouses w
WHERE m.warehouse_id IS NULL
  AND w.user_id = m.user_id
  AND COALESCE(w.tenant_id, '00000000-0000-0000-0000-000000000000'::uuid)
    = COALESCE(m.tenant_id, '00000000-0000-0000-0000-000000000000'::uuid)
  AND w.is_default = true;

UPDATE public.stock_takes t
SET warehouse_id = w.id
FROM public.warehouses w
WHERE t.warehouse_id IS NULL
  AND w.user_id = t.user_id
  AND COALESCE(w.tenant_id, '00000000-0000-0000-0000-000000000000'::uuid)
    = COALESCE(t.tenant_id, '00000000-0000-0000-0000-000000000000'::uuid)
  AND w.is_default = true;
