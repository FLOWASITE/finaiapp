DO $$
DECLARE
  v_tenant uuid := '8681d76b-855b-4142-a699-5eb299070157';
  v_user uuid := 'ea2507f8-9370-4c55-958c-7450b444c3d9';
  v_je uuid := '2763af47-6edc-46be-b138-2044feae154e';
  v_supplier uuid;
  v_voucher uuid;
  v_no text;
  v_next int := 1;
  v_last text;
BEGIN
  -- Skip if voucher already exists for this journal entry
  IF EXISTS (SELECT 1 FROM purchase_vouchers WHERE journal_entry_id = v_je) THEN
    RAISE NOTICE 'Voucher already exists, skipping';
    RETURN;
  END IF;

  -- Find or create supplier
  SELECT id INTO v_supplier FROM suppliers WHERE tenant_id = v_tenant AND tax_id = '0314402905' LIMIT 1;
  IF v_supplier IS NULL THEN
    SELECT code INTO v_last FROM suppliers WHERE tenant_id = v_tenant AND code ILIKE 'NCC%' ORDER BY code DESC LIMIT 1;
    IF v_last IS NOT NULL THEN
      v_next := COALESCE((regexp_match(v_last, '(\d+)$'))[1]::int, 0) + 1;
    END IF;
    INSERT INTO suppliers (tenant_id, user_id, code, name, tax_id, phone, address)
    VALUES (v_tenant, v_user, 'NCC' || lpad(v_next::text, 5, '0'),
      'CÔNG TY TNHH MỘT THÀNH VIÊN JOY FOOD', '0314402905', '(028) 73004769',
      'Số 48 Phú Thọ Hòa, Phường Phú Thọ Hòa,Thành Phố Hồ Chí Minh, Việt Nam')
    RETURNING id INTO v_supplier;
  END IF;

  -- Generate voucher_no
  v_next := 1;
  SELECT voucher_no INTO v_last FROM purchase_vouchers WHERE tenant_id = v_tenant AND voucher_no ILIKE 'PM2026-%' ORDER BY voucher_no DESC LIMIT 1;
  IF v_last IS NOT NULL THEN
    v_next := COALESCE((regexp_match(v_last, '(\d+)$'))[1]::int, 0) + 1;
  END IF;
  v_no := 'PM2026-' || lpad(v_next::text, 5, '0');

  INSERT INTO purchase_vouchers (
    user_id, tenant_id, voucher_no, voucher_date,
    supplier_id, supplier_name, supplier_tax_id, supplier_address,
    invoice_no, invoice_date, reason, currency, exchange_rate,
    subtotal, vat_rate, vat_amount, total, paid_amount,
    debit_account, credit_account, vat_account,
    payment_method, payment_status, pay_now, create_stock_voucher,
    status, posted_at, journal_entry_id
  ) VALUES (
    v_user, v_tenant, v_no, '2026-01-28',
    v_supplier, 'CÔNG TY TNHH MỘT THÀNH VIÊN JOY FOOD', '0314402905',
    'Số 48 Phú Thọ Hòa, Phường Phú Thọ Hòa,Thành Phố Hồ Chí Minh, Việt Nam',
    '00001444', '2026-01-28', 'Hóa đơn 00001444 — CÔNG TY TNHH MỘT THÀNH VIÊN JOY FOOD',
    'VND', 1,
    1883600, 8, 150688, 2034288, 0,
    '156', '331', '1331',
    'credit', 'unpaid', false, false,
    'posted', now(), v_je
  ) RETURNING id INTO v_voucher;

  INSERT INTO purchase_voucher_lines (voucher_id, line_order, description, qty, unit_price, amount, vat_rate, vat_amount, total, line_type, unit, debit_account, vat_account, discount_pct, discount_amount)
  VALUES
    (v_voucher, 0, 'Khay bã mía công thức mới 205x142x13.6mm (50cái/gói ) (T304-G)', 4, 90650, 362600, 8, 29008, 391608, 'goods', 'Gói', '156', '1331', 0, 0),
    (v_voucher, 1, 'Khay bã mía 198 x 118 x 20 mm công thức mới  (T002-G) (50 cái/gói)', 20, 76050, 1521000, 8, 121680, 1642680, 'goods', 'Gói', '156', '1331', 0, 0);

  RAISE NOTICE 'Created voucher % (%) for journal entry %', v_no, v_voucher, v_je;
END $$;