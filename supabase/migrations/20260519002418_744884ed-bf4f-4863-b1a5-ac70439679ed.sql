DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'fa_categories','fa_depreciation_books','fa_asset_books',
    'fa_disposals','fa_events','fa_reclassifications',
    'fa_inventory_counts','fa_inventory_count_lines','depreciation_entries'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS audit_%I ON public.%I', t, t);
    EXECUTE format(
      'CREATE TRIGGER audit_%I AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.audit_trigger()',
      t, t
    );
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.void_depreciation_entry(_entry_id uuid, _reason text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_entry depreciation_entries%ROWTYPE;
  v_asset fixed_assets%ROWTYPE;
  v_uid uuid := auth.uid();
  v_tenant uuid;
  v_je_new uuid;
  v_je_old journal_entries%ROWTYPE;
  r record;
BEGIN
  SELECT * INTO v_entry FROM depreciation_entries WHERE id = _entry_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy bút toán khấu hao'; END IF;
  SELECT * INTO v_asset FROM fixed_assets WHERE id = v_entry.asset_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy tài sản'; END IF;
  v_tenant := v_asset.tenant_id;

  IF NOT public.has_tenant_role(v_uid, v_tenant, ARRAY['owner','admin','accountant']) THEN
    RAISE EXCEPTION 'Không có quyền huỷ bút toán khấu hao';
  END IF;
  IF public.is_period_hard_locked(v_uid, v_entry.period_month) THEN
    RAISE EXCEPTION 'Kỳ đã khoá cứng, không thể huỷ bút toán';
  END IF;

  IF v_entry.journal_entry_id IS NOT NULL THEN
    SELECT * INTO v_je_old FROM journal_entries WHERE id = v_entry.journal_entry_id;
    IF FOUND THEN
      INSERT INTO journal_entries (user_id, tenant_id, entry_date, description)
      VALUES (v_uid, v_tenant, CURRENT_DATE,
        'Huỷ KH: ' || COALESCE(v_je_old.description,'') ||
          CASE WHEN _reason IS NOT NULL THEN ' — ' || _reason ELSE '' END)
      RETURNING id INTO v_je_new;

      FOR r IN
        SELECT account_code, debit, credit, branch_id, department_id, project_id, cost_center_id, line_order
        FROM journal_lines WHERE entry_id = v_je_old.id ORDER BY line_order
      LOOP
        INSERT INTO journal_lines (entry_id, account_code, debit, credit,
          branch_id, department_id, project_id, cost_center_id, line_order)
        VALUES (v_je_new, r.account_code, r.credit, r.debit,
          r.branch_id, r.department_id, r.project_id, r.cost_center_id, r.line_order);
      END LOOP;
    END IF;
  END IF;

  DELETE FROM depreciation_entries WHERE id = _entry_id;
  RETURN v_je_new;
END $$;

REVOKE EXECUTE ON FUNCTION public.void_depreciation_entry(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.void_depreciation_entry(uuid, text) TO authenticated;