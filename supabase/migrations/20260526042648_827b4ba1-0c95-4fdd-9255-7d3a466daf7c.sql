
-- 1) products.aliases (chừa chỗ cho alias tên gọi khác)
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS aliases text[] NOT NULL DEFAULT '{}';

-- 2) supplier_item_mappings
CREATE TABLE IF NOT EXISTS public.supplier_item_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  raw_name text NOT NULL,
  raw_name_norm text NOT NULL,
  raw_unit text,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  unit_conversion_factor numeric NOT NULL DEFAULT 1,
  confidence numeric NOT NULL DEFAULT 0.9,
  match_count int NOT NULL DEFAULT 1,
  last_seen timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'user_confirm'
    CHECK (source IN ('auto','user_confirm','user_create','imported','llm')),
  reasoning text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, supplier_id, raw_name_norm)
);

CREATE INDEX IF NOT EXISTS sim_tenant_supplier_norm_idx
  ON public.supplier_item_mappings (tenant_id, supplier_id, raw_name_norm);
CREATE INDEX IF NOT EXISTS sim_tenant_product_idx
  ON public.supplier_item_mappings (tenant_id, product_id);

CREATE TRIGGER trg_sim_updated_at
  BEFORE UPDATE ON public.supplier_item_mappings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.supplier_item_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sim select" ON public.supplier_item_mappings
  FOR SELECT USING (is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "sim insert" ON public.supplier_item_mappings
  FOR INSERT WITH CHECK (
    tenant_id = current_tenant_id()
    AND has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin','accountant'])
  );
CREATE POLICY "sim update" ON public.supplier_item_mappings
  FOR UPDATE USING (
    has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin','accountant'])
  );
CREATE POLICY "sim delete" ON public.supplier_item_mappings
  FOR DELETE USING (
    has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin','accountant'])
  );

-- 3) item_resolution_log (audit)
CREATE TABLE IF NOT EXISTS public.item_resolution_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  invoice_line_id uuid,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  raw_name text NOT NULL,
  raw_unit text,
  qty numeric,
  price numeric,
  resolved_product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  method text NOT NULL CHECK (method IN ('cache','fuzzy','llm','manual','new_product','none')),
  score numeric,
  signals jsonb NOT NULL DEFAULT '{}'::jsonb,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS irl_tenant_created_idx
  ON public.item_resolution_log (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS irl_invoice_line_idx
  ON public.item_resolution_log (invoice_line_id);

ALTER TABLE public.item_resolution_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "irl select" ON public.item_resolution_log
  FOR SELECT USING (is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "irl insert" ON public.item_resolution_log
  FOR INSERT WITH CHECK (
    tenant_id = current_tenant_id()
    AND is_tenant_member(auth.uid(), tenant_id)
  );
