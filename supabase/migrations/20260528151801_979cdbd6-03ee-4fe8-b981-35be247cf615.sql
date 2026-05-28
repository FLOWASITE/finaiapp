CREATE OR REPLACE FUNCTION public.current_tenant_catalog_diff(p_catalog text)
 RETURNS TABLE(kind text, code text, name text, status text, version integer, pinned_version integer, current_version integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant UUID := public.current_tenant_id();
  v_pinned INT;
  v_current INT;
BEGIN
  IF v_tenant IS NULL THEN RETURN; END IF;

  SELECT mc.current_version INTO v_current FROM public.master_catalogs mc WHERE mc.name = p_catalog;
  IF v_current IS NULL THEN RETURN; END IF;

  SELECT tp.pinned_version INTO v_pinned
    FROM public.tenant_catalog_pins tp
    WHERE tp.tenant_id = v_tenant AND tp.catalog_name = p_catalog;
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
END $function$;