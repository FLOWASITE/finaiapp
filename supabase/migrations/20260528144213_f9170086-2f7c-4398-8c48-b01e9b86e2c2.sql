
CREATE OR REPLACE FUNCTION public.fn_aggregate_supplier_defaults(p_tenant_id uuid)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_upserts int := 0;
BEGIN
  WITH base AS (
    SELECT
      m.tenant_id,
      m.supplier_id,
      CASE p.item_type
        WHEN 'material' THEN 'material'
        WHEN 'tool' THEN 'ccdc'
        WHEN 'asset_tangible' THEN 'asset'
        WHEN 'asset_intangible' THEN 'asset'
        WHEN 'service' THEN 'service'
        ELSE 'goods'
      END AS line_kind,
      COALESCE(p.stock_account, p.expense_account) AS debit_account,
      m.purpose_code,
      m.match_count,
      m.last_seen_at
    FROM public.supplier_item_mappings m
    JOIN public.products p ON p.id = m.product_id
    WHERE m.tenant_id = p_tenant_id
      AND m.archived_at IS NULL
      AND m.confidence >= 0.7
      AND COALESCE(p.stock_account, p.expense_account) IS NOT NULL
  ),
  agg AS (
    SELECT
      tenant_id,
      supplier_id,
      line_kind,
      debit_account,
      purpose_code,
      SUM(match_count)::int AS samples,
      MAX(last_seen_at) AS last_seen,
      ROW_NUMBER() OVER (
        PARTITION BY tenant_id, supplier_id, line_kind
        ORDER BY SUM(match_count) DESC
      ) AS rn,
      SUM(SUM(match_count)) OVER (PARTITION BY tenant_id, supplier_id, line_kind) AS total_samples
    FROM base
    GROUP BY tenant_id, supplier_id, line_kind, debit_account, purpose_code
  ),
  winners AS (
    SELECT *
    FROM agg
    WHERE rn = 1 AND total_samples >= 5
  )
  INSERT INTO public.supplier_default_routing AS sdr
    (tenant_id, supplier_id, line_kind, purpose_code, debit_account, confidence, sample_count, last_seen, updated_at)
  SELECT
    w.tenant_id, w.supplier_id, w.line_kind, w.purpose_code, w.debit_account,
    LEAST(0.99, GREATEST(0.6, w.samples::numeric / NULLIF(w.total_samples, 0))),
    w.samples,
    w.last_seen,
    now()
  FROM winners w
  ON CONFLICT (tenant_id, supplier_id, line_kind) DO UPDATE
    SET purpose_code = EXCLUDED.purpose_code,
        debit_account = EXCLUDED.debit_account,
        confidence = EXCLUDED.confidence,
        sample_count = EXCLUDED.sample_count,
        last_seen = EXCLUDED.last_seen,
        updated_at = now();
  GET DIAGNOSTICS v_upserts = ROW_COUNT;
  RETURN v_upserts;
END $$;

GRANT EXECUTE ON FUNCTION public.fn_aggregate_supplier_defaults(uuid) TO authenticated, service_role;
