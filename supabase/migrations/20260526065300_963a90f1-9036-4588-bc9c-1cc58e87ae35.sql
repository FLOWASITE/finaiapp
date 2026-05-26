ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS ocr_error text;

ALTER TABLE public.documents
  DROP CONSTRAINT IF EXISTS documents_ocr_status_check;

ALTER TABLE public.documents
  ADD CONSTRAINT documents_ocr_status_check
  CHECK (ocr_status = ANY (ARRAY['pending'::text, 'processing'::text, 'done'::text, 'failed'::text, 'rejected'::text]));

UPDATE public.documents d
SET ocr_status = 'rejected',
    ocr_error = COALESCE(d.ocr_error,
      'Tài liệu thuộc MST khác doanh nghiệp — đã loại bỏ tự động.'),
    notes = COALESCE(NULLIF(d.notes,''),
      'Tài liệu thuộc MST khác doanh nghiệp — đã loại bỏ tự động.')
FROM public.tenants t
WHERE d.tenant_id = t.id
  AND t.tax_id IS NOT NULL
  AND d.ocr_status <> 'rejected'
  AND (
    (
      d.doc_kind IN ('purchase_invoice','other')
      AND d.ocr_extracted ? 'buyer_tax_id'
      AND substr(regexp_replace(coalesce(d.ocr_extracted->>'buyer_tax_id',''),'\D','','g'),1,10)
          <> substr(regexp_replace(t.tax_id,'\D','','g'),1,10)
      AND substr(regexp_replace(coalesce(d.ocr_extracted->>'buyer_tax_id',''),'\D','','g'),1,10) <> ''
    )
    OR
    (
      d.doc_kind = 'sales_invoice'
      AND d.ocr_extracted ? 'vendor_tax_id'
      AND substr(regexp_replace(coalesce(d.ocr_extracted->>'vendor_tax_id',''),'\D','','g'),1,10)
          <> substr(regexp_replace(t.tax_id,'\D','','g'),1,10)
      AND substr(regexp_replace(coalesce(d.ocr_extracted->>'vendor_tax_id',''),'\D','','g'),1,10) <> ''
    )
  );