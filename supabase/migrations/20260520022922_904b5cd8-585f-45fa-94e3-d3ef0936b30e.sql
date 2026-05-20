-- Bridge invoices & sales_invoices vào documents registry
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sales_invoice_id uuid REFERENCES public.sales_invoices(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_documents_invoice
  ON public.documents(invoice_id) WHERE invoice_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_documents_sales_invoice
  ON public.documents(sales_invoice_id) WHERE sales_invoice_id IS NOT NULL;

-- Backfill: với mỗi invoice có file_path, tạo documents row nếu chưa có
INSERT INTO public.documents(
  tenant_id, user_id, doc_kind, source,
  storage_bucket, storage_path, original_filename,
  ocr_status, invoice_id, created_at, updated_at
)
SELECT
  i.tenant_id, i.user_id, 'purchase_invoice', 'manual',
  'invoices', i.file_path,
  COALESCE(NULLIF(split_part(i.file_path, '/', -1), ''), 'invoice.pdf'),
  CASE WHEN i.raw_ocr IS NOT NULL THEN 'done' ELSE 'pending' END,
  i.id, i.created_at, i.updated_at
FROM public.invoices i
LEFT JOIN public.documents d
  ON d.invoice_id = i.id
  OR (d.tenant_id = i.tenant_id AND d.storage_bucket = 'invoices' AND d.storage_path = i.file_path)
WHERE d.id IS NULL
  AND i.tenant_id IS NOT NULL
  AND i.file_path IS NOT NULL
  AND i.file_path <> ''
ON CONFLICT (tenant_id, storage_bucket, storage_path) DO UPDATE
  SET invoice_id = EXCLUDED.invoice_id;

-- Cập nhật ocr_extracted từ raw_ocr nếu có
UPDATE public.documents d
SET ocr_extracted = i.raw_ocr
FROM public.invoices i
WHERE d.invoice_id = i.id
  AND d.ocr_extracted IS NULL
  AND i.raw_ocr IS NOT NULL;

-- Backfill einvoices có XML hoặc PDF path → documents
INSERT INTO public.documents(
  tenant_id, user_id, doc_kind, source,
  storage_bucket, storage_path, original_filename,
  ocr_status, einvoice_id, created_at, updated_at
)
SELECT
  e.tenant_id, e.user_id, 'einvoice', 'einvoice_sync',
  'einvoices', COALESCE(e.xml_path, e.pdf_path),
  COALESCE(NULLIF(split_part(COALESCE(e.xml_path, e.pdf_path), '/', -1), ''), 'einvoice.xml'),
  'skipped', e.id, e.created_at, e.updated_at
FROM public.einvoices e
LEFT JOIN public.documents d
  ON d.einvoice_id = e.id
  OR (d.tenant_id = e.tenant_id AND d.storage_bucket = 'einvoices' AND d.storage_path = COALESCE(e.xml_path, e.pdf_path))
WHERE d.id IS NULL
  AND e.tenant_id IS NOT NULL
  AND COALESCE(e.xml_path, e.pdf_path) IS NOT NULL
ON CONFLICT (tenant_id, storage_bucket, storage_path) DO UPDATE
  SET einvoice_id = EXCLUDED.einvoice_id;