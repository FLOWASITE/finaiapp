
ALTER TABLE public.item_resolution_log
  ADD COLUMN IF NOT EXISTS verdict text,
  ADD COLUMN IF NOT EXISTS feedback_reason text,
  ADD COLUMN IF NOT EXISTS corrected_product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS corrected_kind text;

ALTER TABLE public.item_resolution_log
  DROP CONSTRAINT IF EXISTS item_resolution_log_verdict_check;
ALTER TABLE public.item_resolution_log
  ADD CONSTRAINT item_resolution_log_verdict_check
  CHECK (verdict IS NULL OR verdict IN ('approved','rejected','corrected'));

ALTER TABLE public.item_resolution_log
  DROP CONSTRAINT IF EXISTS item_resolution_log_corrected_kind_check;
ALTER TABLE public.item_resolution_log
  ADD CONSTRAINT item_resolution_log_corrected_kind_check
  CHECK (corrected_kind IS NULL OR corrected_kind IN ('goods','ccdc','asset','service'));

-- Allow members to UPDATE their tenant's logs (for feedback)
DROP POLICY IF EXISTS "irl update" ON public.item_resolution_log;
CREATE POLICY "irl update" ON public.item_resolution_log
  FOR UPDATE
  USING (is_tenant_member(auth.uid(), tenant_id))
  WITH CHECK (is_tenant_member(auth.uid(), tenant_id));

GRANT SELECT, INSERT, UPDATE ON public.item_resolution_log TO authenticated;
GRANT ALL ON public.item_resolution_log TO service_role;

CREATE INDEX IF NOT EXISTS irl_tenant_verdict_idx
  ON public.item_resolution_log(tenant_id, verdict, created_at DESC);

-- Resolver weight profile per tenant
CREATE TABLE IF NOT EXISTS public.resolver_weight_profile (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  w_text numeric NOT NULL DEFAULT 0.55,
  w_unit numeric NOT NULL DEFAULT 0.20,
  w_price numeric NOT NULL DEFAULT 0.10,
  w_history numeric NOT NULL DEFAULT 0.10,
  w_sku numeric NOT NULL DEFAULT 0.05,
  heuristic_min_conf numeric NOT NULL DEFAULT 70,
  sample_size integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.resolver_weight_profile TO authenticated;
GRANT ALL ON public.resolver_weight_profile TO service_role;

ALTER TABLE public.resolver_weight_profile ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rwp select" ON public.resolver_weight_profile;
CREATE POLICY "rwp select" ON public.resolver_weight_profile
  FOR SELECT USING (is_tenant_member(auth.uid(), tenant_id));
