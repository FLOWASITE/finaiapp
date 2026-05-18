
-- ============ EINVOICES TABLE ============
CREATE TABLE public.einvoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  direction text NOT NULL CHECK (direction IN ('in','out')),
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('xml_upload','tct_sync','manual')),

  -- Parties
  seller_tax_id text,
  seller_name text,
  seller_address text,
  buyer_tax_id text,
  buyer_name text,
  buyer_address text,

  -- Invoice identification
  invoice_template text,
  invoice_series text,
  invoice_no text,
  issue_date date,
  currency text DEFAULT 'VND',
  exchange_rate numeric DEFAULT 1,

  -- Amounts
  subtotal numeric DEFAULT 0,
  vat_amount numeric DEFAULT 0,
  total numeric DEFAULT 0,

  -- TCT (General Department of Taxation) info
  tct_lookup_code text,
  tct_status text DEFAULT 'pending' CHECK (tct_status IN ('valid','cancelled','replaced','adjusted','pending','unknown')),
  tct_signed_at timestamptz,
  tct_mcct text, -- Mã của cơ quan thuế
  tct_raw jsonb,

  -- Files
  xml_path text,
  pdf_path text,

  -- Reconciliation with internal modules
  matched_sales_invoice_id uuid REFERENCES public.sales_invoices(id) ON DELETE SET NULL,
  matched_purchase_invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  notes text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (tenant_id, direction, seller_tax_id, invoice_series, invoice_no)
);

CREATE INDEX idx_einvoices_tenant_direction ON public.einvoices(tenant_id, direction, issue_date DESC);
CREATE INDEX idx_einvoices_lookup ON public.einvoices(tct_lookup_code) WHERE tct_lookup_code IS NOT NULL;
CREATE INDEX idx_einvoices_matched_purchase ON public.einvoices(matched_purchase_invoice_id) WHERE matched_purchase_invoice_id IS NOT NULL;
CREATE INDEX idx_einvoices_matched_sales ON public.einvoices(matched_sales_invoice_id) WHERE matched_sales_invoice_id IS NOT NULL;

ALTER TABLE public.einvoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant einvoices select" ON public.einvoices
  FOR SELECT USING (
    public.is_tenant_member(auth.uid(), tenant_id) OR public.is_superadmin(auth.uid())
  );
CREATE POLICY "tenant einvoices insert" ON public.einvoices
  FOR INSERT WITH CHECK (
    tenant_id = public.current_tenant_id()
    AND public.has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin','accountant'])
  );
CREATE POLICY "tenant einvoices update" ON public.einvoices
  FOR UPDATE USING (
    public.has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin','accountant'])
  ) WITH CHECK (
    public.has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin','accountant'])
  );
CREATE POLICY "tenant einvoices delete" ON public.einvoices
  FOR DELETE USING (
    public.has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin'])
  );

CREATE TRIGGER einvoices_updated_at BEFORE UPDATE ON public.einvoices
  FOR EACH ROW EXECUTE FUNCTION public.tenants_set_updated_at();

-- ============ EINVOICE LINES ============
CREATE TABLE public.einvoice_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  einvoice_id uuid NOT NULL REFERENCES public.einvoices(id) ON DELETE CASCADE,
  line_no int,
  description text NOT NULL,
  unit text,
  qty numeric DEFAULT 0,
  unit_price numeric DEFAULT 0,
  amount numeric DEFAULT 0,
  vat_rate numeric DEFAULT 0,
  vat_amount numeric DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_einvoice_lines_parent ON public.einvoice_lines(einvoice_id);

ALTER TABLE public.einvoice_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "einvoice lines select via parent" ON public.einvoice_lines
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.einvoices e
            WHERE e.id = einvoice_lines.einvoice_id
              AND (public.is_tenant_member(auth.uid(), e.tenant_id) OR public.is_superadmin(auth.uid())))
  );
CREATE POLICY "einvoice lines write via parent" ON public.einvoice_lines
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.einvoices e
            WHERE e.id = einvoice_lines.einvoice_id
              AND public.has_tenant_role(auth.uid(), e.tenant_id, ARRAY['owner','admin','accountant']))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.einvoices e
            WHERE e.id = einvoice_lines.einvoice_id
              AND public.has_tenant_role(auth.uid(), e.tenant_id, ARRAY['owner','admin','accountant']))
  );

-- ============ EINVOICE SYNC LOGS ============
CREATE TABLE public.einvoice_sync_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  direction text CHECK (direction IN ('in','out','both')),
  date_from date,
  date_to date,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','success','partial','failed')),
  fetched_count int DEFAULT 0,
  created_count int DEFAULT 0,
  duplicate_count int DEFAULT 0,
  error_message text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

CREATE INDEX idx_einvoice_sync_logs_tenant ON public.einvoice_sync_logs(tenant_id, started_at DESC);

ALTER TABLE public.einvoice_sync_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant sync logs select" ON public.einvoice_sync_logs
  FOR SELECT USING (
    public.is_tenant_member(auth.uid(), tenant_id) OR public.is_superadmin(auth.uid())
  );
CREATE POLICY "tenant sync logs insert" ON public.einvoice_sync_logs
  FOR INSERT WITH CHECK (
    tenant_id = public.current_tenant_id()
    AND public.has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin','accountant'])
  );
CREATE POLICY "tenant sync logs update" ON public.einvoice_sync_logs
  FOR UPDATE USING (
    public.has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin','accountant'])
  );

-- ============ STORAGE BUCKET ============
INSERT INTO storage.buckets (id, name, public)
VALUES ('einvoices', 'einvoices', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "einvoices read tenant"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'einvoices'
  AND (
    public.is_tenant_member(auth.uid(), (storage.foldername(name))[1]::uuid)
    OR public.is_superadmin(auth.uid())
  )
);

CREATE POLICY "einvoices write tenant"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'einvoices'
  AND public.has_tenant_role(auth.uid(), (storage.foldername(name))[1]::uuid, ARRAY['owner','admin','accountant'])
);

CREATE POLICY "einvoices delete tenant"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'einvoices'
  AND public.has_tenant_role(auth.uid(), (storage.foldername(name))[1]::uuid, ARRAY['owner','admin'])
);
