-- Add source tracking columns to ai_memory_context
ALTER TABLE public.ai_memory_context
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS source_field text;

ALTER TABLE public.ai_memory_context
  DROP CONSTRAINT IF EXISTS ai_memory_context_source_check;
ALTER TABLE public.ai_memory_context
  ADD CONSTRAINT ai_memory_context_source_check
  CHECK (source IN ('manual','tenant'));

-- Function: sync tenant fields → ai_memory_context (8 managed items)
CREATE OR REPLACE FUNCTION public.sync_tenant_to_context(p_tenant uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t public.tenants%ROWTYPE;
  v_industries text;
  v_legal_form_label text;
  v_acc_label text;
  v_fy text;
  v_contact text;
  v_rep text;
BEGIN
  SELECT * INTO t FROM public.tenants WHERE id = p_tenant;
  IF NOT FOUND THEN RETURN; END IF;

  -- Legal form label
  v_legal_form_label := CASE t.legal_form
    WHEN 'llc' THEN 'Công ty TNHH'
    WHEN 'jsc' THEN 'Công ty Cổ phần'
    WHEN 'partnership' THEN 'Công ty Hợp danh'
    WHEN 'sole_prop' THEN 'Doanh nghiệp tư nhân'
    WHEN 'household' THEN 'Hộ kinh doanh'
    WHEN 'branch' THEN 'Chi nhánh'
    ELSE COALESCE(t.legal_form, '')
  END;

  -- Industries text from jsonb array of {code,name}
  IF t.industries IS NOT NULL AND jsonb_typeof(t.industries) = 'array' AND jsonb_array_length(t.industries) > 0 THEN
    SELECT string_agg(
      COALESCE(elem->>'name','') ||
      CASE WHEN COALESCE(elem->>'code','') <> '' THEN ' ('||(elem->>'code')||')' ELSE '' END,
      '; '
    )
    INTO v_industries
    FROM jsonb_array_elements(t.industries) elem;
  ELSE
    v_industries := COALESCE(t.industry_name, '');
  END IF;

  v_acc_label := CASE t.accounting_standard
    WHEN 'TT99' THEN 'TT 99/2025/TT-BTC (đầy đủ)'
    WHEN 'TT200' THEN 'TT 200/2014/TT-BTC'
    WHEN 'TT133' THEN 'TT 133/2016/TT-BTC (doanh nghiệp nhỏ và vừa)'
    ELSE COALESCE(t.accounting_standard, '')
  END;

  v_fy := CASE
    WHEN t.fiscal_year_start IS NULL OR t.fiscal_year_start = 1 THEN 'Năm tài chính theo năm dương lịch (01/01 - 31/12)'
    ELSE 'Năm tài chính bắt đầu từ tháng ' || t.fiscal_year_start::text
  END;

  v_contact := NULLIF(
    trim(both ' ,' from
      COALESCE(NULLIF(t.email,''), '') ||
      CASE WHEN COALESCE(t.email,'') <> '' AND COALESCE(t.phone,'') <> '' THEN ', ' ELSE '' END ||
      COALESCE(NULLIF(t.phone,''), '')
    ), '');

  v_rep := NULLIF(
    trim(both ' -' from
      COALESCE(NULLIF(t.legal_rep_name,''), '') ||
      CASE WHEN COALESCE(t.legal_rep_name,'') <> '' AND COALESCE(t.legal_rep_title,'') <> '' THEN ' - ' ELSE '' END ||
      COALESCE(NULLIF(t.legal_rep_title,''), '')
    ), '');

  -- Upsert helper inline via INSERT ... ON CONFLICT
  -- 1. Company name
  INSERT INTO public.ai_memory_context (tenant_id, category, key, label, value_text, order_index, source, source_field)
  VALUES (p_tenant, 'org', 'tenant_company_name', 'Tên pháp nhân',
          COALESCE(NULLIF(t.company_name,''), NULLIF(t.name,''), '(Chưa cập nhật)'),
          1, 'tenant', 'company_name')
  ON CONFLICT (tenant_id, category, key) DO UPDATE
    SET value_text = EXCLUDED.value_text, label = EXCLUDED.label,
        source = 'tenant', source_field = EXCLUDED.source_field, updated_at = now();

  -- 2. Tax ID
  INSERT INTO public.ai_memory_context (tenant_id, category, key, label, value_text, order_index, source, source_field)
  VALUES (p_tenant, 'org', 'tenant_tax_id', 'Mã số thuế',
          COALESCE(NULLIF(t.tax_id,''), '(Chưa cập nhật)'),
          2, 'tenant', 'tax_id')
  ON CONFLICT (tenant_id, category, key) DO UPDATE
    SET value_text = EXCLUDED.value_text, label = EXCLUDED.label,
        source = 'tenant', source_field = EXCLUDED.source_field, updated_at = now();

  -- 3. Address
  INSERT INTO public.ai_memory_context (tenant_id, category, key, label, value_text, order_index, source, source_field)
  VALUES (p_tenant, 'org', 'tenant_address', 'Địa chỉ trụ sở',
          COALESCE(NULLIF(t.address,''), '(Chưa cập nhật)'),
          3, 'tenant', 'address')
  ON CONFLICT (tenant_id, category, key) DO UPDATE
    SET value_text = EXCLUDED.value_text, label = EXCLUDED.label,
        source = 'tenant', source_field = EXCLUDED.source_field, updated_at = now();

  -- 4. Legal form
  INSERT INTO public.ai_memory_context (tenant_id, category, key, label, value_text, order_index, source, source_field)
  VALUES (p_tenant, 'org', 'tenant_legal_form', 'Loại hình doanh nghiệp',
          COALESCE(NULLIF(v_legal_form_label,''), '(Chưa cập nhật)'),
          4, 'tenant', 'legal_form')
  ON CONFLICT (tenant_id, category, key) DO UPDATE
    SET value_text = EXCLUDED.value_text, label = EXCLUDED.label,
        source = 'tenant', source_field = EXCLUDED.source_field, updated_at = now();

  -- 5. Contact
  INSERT INTO public.ai_memory_context (tenant_id, category, key, label, value_text, order_index, source, source_field)
  VALUES (p_tenant, 'org', 'tenant_contact', 'Email & Điện thoại',
          COALESCE(v_contact, '(Chưa cập nhật)'),
          5, 'tenant', 'contact')
  ON CONFLICT (tenant_id, category, key) DO UPDATE
    SET value_text = EXCLUDED.value_text, label = EXCLUDED.label,
        source = 'tenant', source_field = EXCLUDED.source_field, updated_at = now();

  -- 6. Legal representative
  INSERT INTO public.ai_memory_context (tenant_id, category, key, label, value_text, order_index, source, source_field)
  VALUES (p_tenant, 'org', 'tenant_legal_rep', 'Người đại diện pháp luật',
          COALESCE(v_rep, '(Chưa cập nhật)'),
          6, 'tenant', 'legal_rep')
  ON CONFLICT (tenant_id, category, key) DO UPDATE
    SET value_text = EXCLUDED.value_text, label = EXCLUDED.label,
        source = 'tenant', source_field = EXCLUDED.source_field, updated_at = now();

  -- 7. Industries
  INSERT INTO public.ai_memory_context (tenant_id, category, key, label, value_text, order_index, source, source_field)
  VALUES (p_tenant, 'business_model', 'tenant_industries', 'Ngành nghề kinh doanh',
          COALESCE(NULLIF(v_industries,''), '(Chưa cập nhật)'),
          1, 'tenant', 'industries')
  ON CONFLICT (tenant_id, category, key) DO UPDATE
    SET value_text = EXCLUDED.value_text, label = EXCLUDED.label,
        source = 'tenant', source_field = EXCLUDED.source_field, updated_at = now();

  -- 8. Accounting standard + fiscal year (combined)
  INSERT INTO public.ai_memory_context (tenant_id, category, key, label, value_text, order_index, source, source_field)
  VALUES (p_tenant, 'accounting', 'tenant_accounting_standard', 'Chế độ kế toán & năm tài chính',
          v_acc_label || E'\n' || v_fy,
          1, 'tenant', 'accounting_standard')
  ON CONFLICT (tenant_id, category, key) DO UPDATE
    SET value_text = EXCLUDED.value_text, label = EXCLUDED.label,
        source = 'tenant', source_field = EXCLUDED.source_field, updated_at = now();
END $$;

-- Trigger
CREATE OR REPLACE FUNCTION public.tg_tenant_sync_context()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.sync_tenant_to_context(NEW.id);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tenant_sync_context ON public.tenants;
CREATE TRIGGER tenant_sync_context
AFTER INSERT OR UPDATE OF company_name, name, tax_id, address, legal_form,
  industries, industry_name, industry_code, accounting_standard, fiscal_year_start,
  email, phone, legal_rep_name, legal_rep_title
ON public.tenants
FOR EACH ROW EXECUTE FUNCTION public.tg_tenant_sync_context();

-- Backfill existing tenants
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.tenants LOOP
    PERFORM public.sync_tenant_to_context(r.id);
  END LOOP;
END $$;