
-- ============================================================
-- PHASE 1: Vòng đời + Conflict cho supplier_item_mappings
-- ============================================================
ALTER TABLE public.supplier_item_mappings
  ADD COLUMN IF NOT EXISTS correction_count int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_correction_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS vote_log jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_sim_archived
  ON public.supplier_item_mappings(tenant_id, supplier_id)
  WHERE archived_at IS NULL;

-- Recency-weighted winner: trọng số exp(-Δdays/30)
CREATE OR REPLACE FUNCTION public.fn_recency_weighted_winner(p_log jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_now timestamptz := now();
  v_entry jsonb;
  v_key text;
  v_weight numeric;
  v_at timestamptz;
  v_tally jsonb := '{}'::jsonb;
  v_max numeric := 0;
  v_winner text;
  v_pid text;
  v_purp text;
BEGIN
  IF p_log IS NULL OR jsonb_array_length(p_log) = 0 THEN
    RETURN NULL;
  END IF;
  FOR v_entry IN SELECT * FROM jsonb_array_elements(p_log) LOOP
    v_pid := COALESCE(v_entry->>'product_id', '');
    v_purp := COALESCE(v_entry->>'purpose_code', '');
    v_key := v_pid || '|' || v_purp;
    v_at := COALESCE((v_entry->>'at')::timestamptz, v_now);
    v_weight := exp(-EXTRACT(EPOCH FROM (v_now - v_at)) / (30.0 * 86400));
    v_tally := jsonb_set(
      v_tally, ARRAY[v_key],
      to_jsonb(COALESCE((v_tally->>v_key)::numeric, 0) + v_weight)
    );
  END LOOP;
  FOR v_key, v_weight IN
    SELECT k, (v::text)::numeric FROM jsonb_each(v_tally) AS t(k,v)
  LOOP
    IF v_weight > v_max THEN
      v_max := v_weight;
      v_winner := v_key;
    END IF;
  END LOOP;
  IF v_winner IS NULL THEN RETURN NULL; END IF;
  RETURN jsonb_build_object(
    'product_id', NULLIF(split_part(v_winner, '|', 1), ''),
    'purpose_code', NULLIF(split_part(v_winner, '|', 2), ''),
    'weight', v_max
  );
END $$;

-- ============================================================
-- PHASE 2: T2 — Default cấp NCC
-- ============================================================
CREATE TABLE IF NOT EXISTS public.supplier_default_routing (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  line_kind text NOT NULL,
  purpose_code text,
  debit_account text,
  confidence numeric NOT NULL DEFAULT 0.6,
  sample_count int NOT NULL DEFAULT 0,
  last_seen timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, supplier_id, line_kind)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.supplier_default_routing TO authenticated;
GRANT ALL ON public.supplier_default_routing TO service_role;

ALTER TABLE public.supplier_default_routing ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sdr select" ON public.supplier_default_routing
  FOR SELECT TO authenticated USING (public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "sdr write" ON public.supplier_default_routing
  FOR ALL TO authenticated
  USING (public.has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin','accountant']))
  WITH CHECK (tenant_id = public.current_tenant_id()
              AND public.has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin','accountant']));

-- ============================================================
-- PHASE 3: Negative memory cho mapping
-- ============================================================
CREATE TABLE IF NOT EXISTS public.supplier_item_rejections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  raw_name_norm text NOT NULL,
  rejected_product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  rejected_purpose_code text,
  count int NOT NULL DEFAULT 1,
  last_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, supplier_id, raw_name_norm, rejected_product_id, rejected_purpose_code)
);

CREATE INDEX IF NOT EXISTS idx_sir_lookup
  ON public.supplier_item_rejections(tenant_id, supplier_id, raw_name_norm);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.supplier_item_rejections TO authenticated;
GRANT ALL ON public.supplier_item_rejections TO service_role;

ALTER TABLE public.supplier_item_rejections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sir select" ON public.supplier_item_rejections
  FOR SELECT TO authenticated USING (public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "sir write" ON public.supplier_item_rejections
  FOR ALL TO authenticated
  USING (public.has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin','accountant']))
  WITH CHECK (tenant_id = public.current_tenant_id()
              AND public.has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin','accountant']));

-- ============================================================
-- PHASE 4: Global NCC registry (chỉ danh tính, ẩn danh)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.global_supplier_registry (
  tax_id text PRIMARY KEY,
  display_name text,
  industry_code text,
  industry_name text,
  confidence numeric NOT NULL DEFAULT 0.6,
  contributor_count int NOT NULL DEFAULT 0,
  first_seen timestamptz NOT NULL DEFAULT now(),
  last_seen timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.global_supplier_registry TO authenticated;
GRANT ALL ON public.global_supplier_registry TO service_role;

ALTER TABLE public.global_supplier_registry ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gsr public read" ON public.global_supplier_registry
  FOR SELECT TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS public.global_supplier_contributions (
  tax_id text NOT NULL,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  display_name text,
  industry_code text,
  at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tax_id, tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_gsc_tax_id ON public.global_supplier_contributions(tax_id);

GRANT ALL ON public.global_supplier_contributions TO service_role;
-- KHÔNG grant cho authenticated — chỉ service_role aggregate
ALTER TABLE public.global_supplier_contributions ENABLE ROW LEVEL SECURITY;

-- Aggregate function: name/industry phổ biến nhất khi ≥ 2 tenant đóng góp
CREATE OR REPLACE FUNCTION public.fn_aggregate_global_registry()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_count int := 0;
BEGIN
  WITH agg AS (
    SELECT tax_id,
           COUNT(DISTINCT tenant_id) AS contributors,
           MIN(at) AS first_seen,
           MAX(at) AS last_seen,
           (
             SELECT display_name FROM public.global_supplier_contributions g2
             WHERE g2.tax_id = g1.tax_id AND g2.display_name IS NOT NULL
             GROUP BY display_name ORDER BY COUNT(*) DESC, MAX(at) DESC LIMIT 1
           ) AS top_name,
           (
             SELECT industry_code FROM public.global_supplier_contributions g3
             WHERE g3.tax_id = g1.tax_id AND g3.industry_code IS NOT NULL
             GROUP BY industry_code ORDER BY COUNT(*) DESC, MAX(at) DESC LIMIT 1
           ) AS top_industry
    FROM public.global_supplier_contributions g1
    GROUP BY tax_id
    HAVING COUNT(DISTINCT tenant_id) >= 2
  )
  INSERT INTO public.global_supplier_registry
    (tax_id, display_name, industry_code, contributor_count, first_seen, last_seen, confidence, updated_at)
  SELECT tax_id, top_name, top_industry, contributors, first_seen, last_seen,
         LEAST(0.5 + (contributors::numeric * 0.1), 0.99),
         now()
  FROM agg
  ON CONFLICT (tax_id) DO UPDATE SET
    display_name = COALESCE(EXCLUDED.display_name, public.global_supplier_registry.display_name),
    industry_code = COALESCE(EXCLUDED.industry_code, public.global_supplier_registry.industry_code),
    contributor_count = EXCLUDED.contributor_count,
    last_seen = EXCLUDED.last_seen,
    confidence = EXCLUDED.confidence,
    updated_at = now();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $$;

-- ============================================================
-- PHASE 5: Auto-post threshold per-tenant
-- ============================================================
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS auto_post_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_post_min_confidence numeric NOT NULL DEFAULT 0.95,
  ADD COLUMN IF NOT EXISTS auto_post_max_amount numeric NOT NULL DEFAULT 5000000;
