
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS storage_tier text NOT NULL DEFAULT 'hot' CHECK (storage_tier IN ('hot','warm','archived')),
  ADD COLUMN IF NOT EXISTS last_accessed_at timestamptz,
  ADD COLUMN IF NOT EXISTS compressed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_documents_tier_created
  ON public.documents (tenant_id, storage_tier, created_at);

INSERT INTO storage.buckets (id, name, public)
VALUES ('einvoices-archive', 'einvoices-archive', false)
ON CONFLICT (id) DO NOTHING;

DO $$ BEGIN
  CREATE POLICY "einvoices-archive tenant read" ON storage.objects FOR SELECT
    USING (
      bucket_id = 'einvoices-archive'
      AND EXISTS (
        SELECT 1 FROM public.documents d
        WHERE d.storage_bucket = 'einvoices-archive'
          AND d.storage_path = name
          AND public.has_tenant_role(auth.uid(), d.tenant_id, ARRAY['owner','admin','accountant','viewer'])
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "einvoices-archive service write" ON storage.objects FOR INSERT
    WITH CHECK (bucket_id = 'einvoices-archive' AND auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE OR REPLACE FUNCTION public.unaccent_immutable(text)
RETURNS text
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
SET search_path = public, extensions
AS $$ SELECT lower(public.unaccent('public.unaccent', $1)) $$;

CREATE INDEX IF NOT EXISTS idx_suppliers_search_trgm
  ON public.suppliers USING gin (public.unaccent_immutable(name) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_suppliers_taxid
  ON public.suppliers (tenant_id, tax_id) WHERE tax_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_search_trgm
  ON public.invoices USING gin (public.unaccent_immutable(coalesce(supplier_name,'') || ' ' || coalesce(invoice_no,'')) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_invoices_supplier_taxid
  ON public.invoices (tenant_id, supplier_tax_id) WHERE supplier_tax_id IS NOT NULL;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='customers') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_customers_search_trgm ON public.customers USING gin (public.unaccent_immutable(name) gin_trgm_ops)';
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='products') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_products_search_trgm ON public.products USING gin (public.unaccent_immutable(name) gin_trgm_ops)';
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='sales_invoices') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_sales_invoices_search_trgm ON public.sales_invoices USING gin (public.unaccent_immutable(coalesce(customer_name,'''') || '' '' || coalesce(invoice_no,'''')) gin_trgm_ops)';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.search_global(p_tenant_id uuid, p_query text, p_limit int DEFAULT 20)
RETURNS TABLE (
  kind text,
  id uuid,
  title text,
  subtitle text,
  meta jsonb,
  score real
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE q text;
BEGIN
  IF NOT public.has_tenant_role(auth.uid(), p_tenant_id, ARRAY['owner','admin','accountant','viewer']) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  q := public.unaccent_immutable(coalesce(p_query, ''));
  IF length(q) < 2 THEN RETURN; END IF;

  RETURN QUERY
  SELECT 'supplier'::text, s.id, s.name,
         coalesce(s.tax_id, ''),
         jsonb_build_object('tax_id', s.tax_id),
         similarity(public.unaccent_immutable(s.name), q)::real
  FROM public.suppliers s
  WHERE s.tenant_id = p_tenant_id
    AND (public.unaccent_immutable(s.name) % q OR s.tax_id = p_query)
  ORDER BY 6 DESC NULLS LAST
  LIMIT p_limit;

  RETURN QUERY
  SELECT 'invoice'::text, i.id,
         coalesce(i.invoice_no, '(không số)'),
         coalesce(i.supplier_name, ''),
         jsonb_build_object('issue_date', i.issue_date, 'amount', i.total_amount, 'tax_id', i.supplier_tax_id),
         GREATEST(
           similarity(public.unaccent_immutable(coalesce(i.supplier_name,'')), q),
           similarity(public.unaccent_immutable(coalesce(i.invoice_no,'')), q)
         )::real
  FROM public.invoices i
  WHERE i.tenant_id = p_tenant_id
    AND (
      public.unaccent_immutable(coalesce(i.supplier_name,'') || ' ' || coalesce(i.invoice_no,'')) % q
      OR i.supplier_tax_id = p_query
    )
  ORDER BY 6 DESC NULLS LAST
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.search_global(uuid, text, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unaccent_immutable(text) TO authenticated, anon;

CREATE OR REPLACE FUNCTION public.mark_document_accessed(p_document_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE public.documents
  SET last_accessed_at = now()
  WHERE id = p_document_id
    AND public.has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin','accountant','viewer']);
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_document_accessed(uuid) TO authenticated;
