ALTER TABLE public.tenant_product_catalog ADD COLUMN IF NOT EXISTS is_global boolean NOT NULL DEFAULT false;
ALTER TABLE public.tenant_product_catalog ALTER COLUMN tenant_id DROP NOT NULL;
ALTER TABLE public.tenant_product_catalog DROP CONSTRAINT IF EXISTS tpc_tenant_or_global;
ALTER TABLE public.tenant_product_catalog ADD CONSTRAINT tpc_tenant_or_global CHECK (is_global OR tenant_id IS NOT NULL);

-- Cập nhật RLS: cho phép đọc bản ghi global cho mọi user đã đăng nhập
DROP POLICY IF EXISTS "tpc_select_global_or_tenant" ON public.tenant_product_catalog;
CREATE POLICY "tpc_select_global_or_tenant"
  ON public.tenant_product_catalog
  FOR SELECT
  TO authenticated
  USING (is_global = true OR tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_tpc_is_global ON public.tenant_product_catalog(is_global) WHERE is_global = true;