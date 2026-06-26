
CREATE OR REPLACE FUNCTION public.assert_period_not_sealed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_date date;
  v_tenant uuid;
  v_sealed boolean;
  v_row jsonb;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_row := to_jsonb(OLD);
  ELSE
    v_row := to_jsonb(NEW);
  END IF;

  BEGIN v_tenant := (v_row->>'tenant_id')::uuid; EXCEPTION WHEN others THEN v_tenant := NULL; END;

  v_date := CASE TG_TABLE_NAME
    WHEN 'journal_entries'   THEN (v_row->>'entry_date')::date
    WHEN 'invoices'          THEN (v_row->>'issue_date')::date
    WHEN 'sales_invoices'    THEN (v_row->>'issue_date')::date
    WHEN 'customer_receipts' THEN (v_row->>'pay_date')::date
    WHEN 'supplier_payments' THEN (v_row->>'pay_date')::date
  END;

  IF v_date IS NULL OR v_tenant IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT is_sealed INTO v_sealed
  FROM public.fiscal_periods
  WHERE tenant_id = v_tenant
    AND year = EXTRACT(YEAR FROM v_date)::int
    AND period_no = EXTRACT(MONTH FROM v_date)::int
  LIMIT 1;

  IF v_sealed = true THEN
    RAISE EXCEPTION 'Kỳ kế toán % đã được niêm phong. Không thể thay đổi dữ liệu.',
      to_char(v_date, 'MM/YYYY')
      USING ERRCODE = 'P0001';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;
