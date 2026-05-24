UPDATE documents d
SET doc_kind = 'sales_invoice'
FROM ai_uploads au, tenants t
WHERE d.ai_upload_id = au.id
  AND d.tenant_id = t.id
  AND au.parsed IS NOT NULL
  AND regexp_replace(coalesce(au.parsed->>'vendor_tax_id',''), '\D', '', 'g') <> ''
  AND regexp_replace(coalesce(au.parsed->>'vendor_tax_id',''), '\D', '', 'g')
      = regexp_replace(coalesce(t.tax_id,''), '\D', '', 'g')
  AND d.doc_kind IN ('purchase_invoice','other','einvoice');

UPDATE ai_uploads au
SET kind = 'sales_invoice'
FROM documents d, tenants t
WHERE d.ai_upload_id = au.id
  AND d.tenant_id = t.id
  AND au.parsed IS NOT NULL
  AND regexp_replace(coalesce(au.parsed->>'vendor_tax_id',''), '\D', '', 'g') <> ''
  AND regexp_replace(coalesce(au.parsed->>'vendor_tax_id',''), '\D', '', 'g')
      = regexp_replace(coalesce(t.tax_id,''), '\D', '', 'g')
  AND au.kind <> 'sales_invoice';