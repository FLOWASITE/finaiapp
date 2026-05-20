
-- 1. CHECK constraints (re-apply idempotently — first run partially succeeded)
ALTER TABLE public.documents DROP CONSTRAINT IF EXISTS documents_doc_kind_check;
ALTER TABLE public.documents ADD CONSTRAINT documents_doc_kind_check
  CHECK (doc_kind = ANY (ARRAY[
    'purchase_invoice','sales_invoice','einvoice','cash_voucher','bank_voucher',
    'bank_statement','receipt','payment','contract','other'
  ]));

ALTER TABLE public.documents DROP CONSTRAINT IF EXISTS documents_source_check;
ALTER TABLE public.documents ADD CONSTRAINT documents_source_check
  CHECK (source = ANY (ARRAY[
    'manual','email','einvoice_sync','bank_import','api','ai_chat','tct_sync'
  ]));

-- 2. Columns (idempotent)
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS ai_upload_id uuid REFERENCES public.ai_uploads(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS einvoice_id  uuid REFERENCES public.einvoices(id)  ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_documents_ai_upload ON public.documents(ai_upload_id) WHERE ai_upload_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_documents_einvoice  ON public.documents(einvoice_id)  WHERE einvoice_id  IS NOT NULL;

-- 3. Backfill ai_uploads (skip if same tenant+path already exists)
INSERT INTO public.documents (
  tenant_id, user_id, doc_kind, source, storage_bucket, storage_path,
  original_filename, mime_type, checksum_sha256, ocr_status, ocr_extracted,
  ai_upload_id, created_at, updated_at
)
SELECT
  p.active_tenant_id, au.user_id,
  CASE au.kind
    WHEN 'bank_statement'   THEN 'bank_statement'
    WHEN 'purchase_invoice' THEN 'purchase_invoice'
    WHEN 'cash_voucher'     THEN 'cash_voucher'
    ELSE 'other'
  END,
  'ai_chat', 'invoices', au.file_path,
  au.filename, au.mime_type, au.file_hash,
  CASE au.status WHEN 'parsed' THEN 'done' WHEN 'failed' THEN 'failed' WHEN 'parsing' THEN 'processing' ELSE 'pending' END,
  au.parsed, au.id, au.created_at, au.created_at
FROM public.ai_uploads au
JOIN public.profiles p ON p.id = au.user_id
WHERE au.file_path IS NOT NULL
  AND p.active_tenant_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.documents d
    WHERE d.tenant_id = p.active_tenant_id
      AND d.storage_bucket = 'invoices'
      AND d.storage_path = au.file_path
  );

-- Link existing documents back to ai_uploads when paths match (no insert)
UPDATE public.documents d
SET ai_upload_id = au.id
FROM public.ai_uploads au
WHERE d.ai_upload_id IS NULL
  AND d.storage_bucket = 'invoices'
  AND d.storage_path = au.file_path;

-- 4. Backfill einvoices (skip if same path already exists)
INSERT INTO public.documents (
  tenant_id, user_id, doc_kind, source, storage_bucket, storage_path,
  original_filename, mime_type, einvoice_id, created_at, updated_at, ocr_status
)
SELECT
  e.tenant_id, e.user_id, 'einvoice', 'tct_sync', 'einvoices',
  COALESCE(e.pdf_path, e.xml_path),
  COALESCE(NULLIF(e.invoice_series,'') || '-' || e.invoice_no, e.invoice_no),
  CASE WHEN e.pdf_path IS NOT NULL THEN 'application/pdf' ELSE 'application/xml' END,
  e.id, e.created_at, e.updated_at, 'done'
FROM public.einvoices e
WHERE (e.xml_path IS NOT NULL OR e.pdf_path IS NOT NULL)
  AND e.tenant_id IS NOT NULL AND e.user_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.documents d
    WHERE d.tenant_id = e.tenant_id
      AND d.storage_bucket = 'einvoices'
      AND d.storage_path = COALESCE(e.pdf_path, e.xml_path)
  );

-- Link existing einvoice documents back
UPDATE public.documents d
SET einvoice_id = e.id
FROM public.einvoices e
WHERE d.einvoice_id IS NULL
  AND d.storage_bucket = 'einvoices'
  AND d.storage_path = COALESCE(e.pdf_path, e.xml_path);
