
-- 1. Versioning columns on master tables
ALTER TABLE public.chart_of_accounts
  ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','deprecated')),
  ADD COLUMN IF NOT EXISTS deprecated_in_version INT,
  ADD COLUMN IF NOT EXISTS effective_from TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE public.tenant_product_catalog
  ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','deprecated')),
  ADD COLUMN IF NOT EXISTS deprecated_in_version INT,
  ADD COLUMN IF NOT EXISTS effective_from TIMESTAMPTZ NOT NULL DEFAULT now();

-- 2. Master catalog registry
CREATE TABLE IF NOT EXISTS public.master_catalogs (
  name TEXT PRIMARY KEY,
  current_version INT NOT NULL DEFAULT 1,
  description TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID
);

GRANT SELECT ON public.master_catalogs TO authenticated;
GRANT ALL    ON public.master_catalogs TO service_role;

ALTER TABLE public.master_catalogs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can read master_catalogs"
  ON public.master_catalogs FOR SELECT TO authenticated USING (true);

INSERT INTO public.master_catalogs(name, current_version, description) VALUES
  ('coa', 1, 'Hệ thống tài khoản kế toán dùng chung'),
  ('tpc', 1, 'Danh mục mặt hàng dùng chung')
ON CONFLICT (name) DO NOTHING;

-- 3. Tenant pins
CREATE TABLE IF NOT EXISTS public.tenant_catalog_pins (
  tenant_id      UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  catalog_name   TEXT NOT NULL REFERENCES public.master_catalogs(name) ON DELETE CASCADE,
  pinned_version INT  NOT NULL DEFAULT 1,
  last_ack_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_ack_by    UUID,
  PRIMARY KEY (tenant_id, catalog_name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_catalog_pins TO authenticated;
GRANT ALL ON public.tenant_catalog_pins TO service_role;

ALTER TABLE public.tenant_catalog_pins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can read pins"
  ON public.tenant_catalog_pins FOR SELECT TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id));

CREATE POLICY "Members can upsert pins"
  ON public.tenant_catalog_pins FOR INSERT TO authenticated
  WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));

CREATE POLICY "Members can update pins"
  ON public.tenant_catalog_pins FOR UPDATE TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id));

-- 4. Tenant COA overrides
CREATE TABLE IF NOT EXISTS public.tenant_coa_overrides (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  account_code TEXT NOT NULL,
  action       TEXT NOT NULL CHECK (action IN ('hide','rename','add')),
  name         TEXT,
  type         TEXT,
  parent_code  TEXT,
  notes        TEXT,
  created_by   UUID,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, account_code, action)
);

CREATE INDEX IF NOT EXISTS idx_tco_tenant ON public.tenant_coa_overrides(tenant_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_coa_overrides TO authenticated;
GRANT ALL ON public.tenant_coa_overrides TO service_role;

ALTER TABLE public.tenant_coa_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can read overrides"
  ON public.tenant_coa_overrides FOR SELECT TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id));

CREATE POLICY "Privileged members can write overrides"
  ON public.tenant_coa_overrides FOR ALL TO authenticated
  USING (public.has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin','accountant']))
  WITH CHECK (public.has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin','accountant']));

CREATE TRIGGER trg_tco_updated_at
  BEFORE UPDATE ON public.tenant_coa_overrides
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 5. Diff function
CREATE OR REPLACE FUNCTION public.current_tenant_catalog_diff(p_catalog TEXT)
RETURNS TABLE(
  kind TEXT,            -- 'added' | 'removed' | 'changed'
  code TEXT,
  name TEXT,
  status TEXT,
  version INT,
  pinned_version INT,
  current_version INT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_tenant_id();
  v_pinned INT;
  v_current INT;
BEGIN
  IF v_tenant IS NULL THEN RETURN; END IF;

  SELECT current_version INTO v_current FROM public.master_catalogs WHERE name = p_catalog;
  IF v_current IS NULL THEN RETURN; END IF;

  SELECT pinned_version INTO v_pinned
    FROM public.tenant_catalog_pins
    WHERE tenant_id = v_tenant AND catalog_name = p_catalog;
  v_pinned := COALESCE(v_pinned, 0);

  IF p_catalog = 'coa' THEN
    RETURN QUERY
      SELECT 'added'::text, c.code, c.name, c.status, c.version, v_pinned, v_current
        FROM public.chart_of_accounts c
        WHERE c.version > v_pinned AND c.status = 'active'
      UNION ALL
      SELECT 'removed'::text, c.code, c.name, c.status, c.deprecated_in_version, v_pinned, v_current
        FROM public.chart_of_accounts c
        WHERE c.status = 'deprecated' AND COALESCE(c.deprecated_in_version,0) > v_pinned;
  ELSIF p_catalog = 'tpc' THEN
    RETURN QUERY
      SELECT 'added'::text, t.sku, t.name, t.status, t.version, v_pinned, v_current
        FROM public.tenant_product_catalog t
        WHERE t.is_global = true AND t.version > v_pinned AND t.status = 'active'
      UNION ALL
      SELECT 'removed'::text, t.sku, t.name, t.status, t.deprecated_in_version, v_pinned, v_current
        FROM public.tenant_product_catalog t
        WHERE t.is_global = true AND t.status = 'deprecated' AND COALESCE(t.deprecated_in_version,0) > v_pinned;
  END IF;
END $$;

GRANT EXECUTE ON FUNCTION public.current_tenant_catalog_diff(TEXT) TO authenticated;

-- 6. Acknowledge function
CREATE OR REPLACE FUNCTION public.acknowledge_catalog_version(p_catalog TEXT)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_tenant_id();
  v_uid    UUID := auth.uid();
  v_current INT;
BEGIN
  IF v_tenant IS NULL OR v_uid IS NULL THEN RAISE EXCEPTION 'Chưa đăng nhập / chưa chọn doanh nghiệp'; END IF;
  IF NOT public.has_tenant_role(v_uid, v_tenant, ARRAY['owner','admin','accountant']) THEN
    RAISE EXCEPTION 'Không có quyền đồng bộ phiên bản danh mục';
  END IF;

  SELECT current_version INTO v_current FROM public.master_catalogs WHERE name = p_catalog;
  IF v_current IS NULL THEN RAISE EXCEPTION 'Danh mục không tồn tại'; END IF;

  INSERT INTO public.tenant_catalog_pins(tenant_id, catalog_name, pinned_version, last_ack_at, last_ack_by)
  VALUES (v_tenant, p_catalog, v_current, now(), v_uid)
  ON CONFLICT (tenant_id, catalog_name) DO UPDATE
    SET pinned_version = EXCLUDED.pinned_version,
        last_ack_at    = now(),
        last_ack_by    = v_uid;

  RETURN v_current;
END $$;

GRANT EXECUTE ON FUNCTION public.acknowledge_catalog_version(TEXT) TO authenticated;
