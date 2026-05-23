CREATE OR REPLACE FUNCTION public.merge_parties(p_kind text, p_primary uuid, p_secondary uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant uuid := public.current_tenant_id();
  v_counts jsonb := '{}'::jsonb;
  v_n int;
  v_pri_tenant uuid;
  v_sec_tenant uuid;
  v_pri_ob_d numeric; v_pri_ob_c numeric;
  v_sec_ob_d numeric; v_sec_ob_c numeric;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Chưa đăng nhập'; END IF;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Chưa chọn doanh nghiệp'; END IF;
  IF p_primary IS NULL OR p_secondary IS NULL OR p_primary = p_secondary THEN
    RAISE EXCEPTION 'Phải chọn 2 đối tượng khác nhau';
  END IF;
  IF p_kind NOT IN ('customer','supplier') THEN
    RAISE EXCEPTION 'Loại không hợp lệ';
  END IF;
  IF NOT public.has_tenant_role(v_uid, v_tenant, ARRAY['owner','admin','accountant']) THEN
    RAISE EXCEPTION 'Không có quyền gộp đối tượng này';
  END IF;

  IF p_kind = 'customer' THEN
    SELECT tenant_id, COALESCE(opening_balance_debit,0), COALESCE(opening_balance_credit,0)
      INTO v_pri_tenant, v_pri_ob_d, v_pri_ob_c FROM public.customers WHERE id = p_primary;
    SELECT tenant_id, COALESCE(opening_balance_debit,0), COALESCE(opening_balance_credit,0)
      INTO v_sec_tenant, v_sec_ob_d, v_sec_ob_c FROM public.customers WHERE id = p_secondary;
    IF v_pri_tenant IS NULL OR v_sec_tenant IS NULL THEN RAISE EXCEPTION 'Không tìm thấy khách hàng'; END IF;
    IF v_pri_tenant <> v_tenant OR v_sec_tenant <> v_tenant THEN
      RAISE EXCEPTION 'Khách hàng không thuộc doanh nghiệp hiện tại';
    END IF;

    UPDATE public.customer_receipts SET customer_id = p_primary WHERE customer_id = p_secondary; GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('customer_receipts', v_n);
    UPDATE public.projects           SET customer_id = p_primary WHERE customer_id = p_secondary; GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('projects', v_n);
    UPDATE public.sales_invoices     SET customer_id = p_primary WHERE customer_id = p_secondary; GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('sales_invoices', v_n);
    UPDATE public.sales_orders       SET customer_id = p_primary WHERE customer_id = p_secondary; GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('sales_orders', v_n);
    UPDATE public.sales_vouchers     SET customer_id = p_primary WHERE customer_id = p_secondary; GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('sales_vouchers', v_n);

    UPDATE public.bank_vouchers       SET party_id = p_primary WHERE party_id = p_secondary; GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('bank_vouchers', v_n);
    UPDATE public.stock_vouchers      SET party_id = p_primary WHERE party_id = p_secondary; GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('stock_vouchers', v_n);
    UPDATE public.ai_memory_partners  SET party_id = p_primary WHERE party_id = p_secondary AND party_kind = 'customer'; GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('ai_memory_partners', v_n);

    UPDATE public.customers
      SET opening_balance_debit  = COALESCE(opening_balance_debit,0)  + v_sec_ob_d,
          opening_balance_credit = COALESCE(opening_balance_credit,0) + v_sec_ob_c
      WHERE id = p_primary;

    DELETE FROM public.customers WHERE id = p_secondary;

  ELSE
    SELECT tenant_id, COALESCE(opening_balance_debit,0), COALESCE(opening_balance_credit,0)
      INTO v_pri_tenant, v_pri_ob_d, v_pri_ob_c FROM public.suppliers WHERE id = p_primary;
    SELECT tenant_id, COALESCE(opening_balance_debit,0), COALESCE(opening_balance_credit,0)
      INTO v_sec_tenant, v_sec_ob_d, v_sec_ob_c FROM public.suppliers WHERE id = p_secondary;
    IF v_pri_tenant IS NULL OR v_sec_tenant IS NULL THEN RAISE EXCEPTION 'Không tìm thấy nhà cung cấp'; END IF;
    IF v_pri_tenant <> v_tenant OR v_sec_tenant <> v_tenant THEN
      RAISE EXCEPTION 'Nhà cung cấp không thuộc doanh nghiệp hiện tại';
    END IF;

    UPDATE public.fixed_assets       SET supplier_id = p_primary WHERE supplier_id = p_secondary; GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('fixed_assets', v_n);
    UPDATE public.invoices           SET supplier_id = p_primary WHERE supplier_id = p_secondary; GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('invoices', v_n);
    UPDATE public.purchase_vouchers  SET supplier_id = p_primary WHERE supplier_id = p_secondary; GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('purchase_vouchers', v_n);
    UPDATE public.supplier_payments  SET supplier_id = p_primary WHERE supplier_id = p_secondary; GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('supplier_payments', v_n);

    UPDATE public.bank_vouchers       SET party_id = p_primary WHERE party_id = p_secondary; GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('bank_vouchers', v_n);
    UPDATE public.stock_vouchers      SET party_id = p_primary WHERE party_id = p_secondary; GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('stock_vouchers', v_n);
    UPDATE public.ai_memory_partners  SET party_id = p_primary WHERE party_id = p_secondary AND party_kind = 'supplier'; GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('ai_memory_partners', v_n);

    UPDATE public.suppliers
      SET opening_balance_debit  = COALESCE(opening_balance_debit,0)  + v_sec_ob_d,
          opening_balance_credit = COALESCE(opening_balance_credit,0) + v_sec_ob_c
      WHERE id = p_primary;

    DELETE FROM public.suppliers WHERE id = p_secondary;
  END IF;

  RETURN jsonb_build_object('ok', true, 'moved', v_counts);
END;
$$;