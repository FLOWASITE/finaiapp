
-- ============================================================
-- 1. Mở rộng system_backups
-- ============================================================
ALTER TABLE public.system_backups
  ADD COLUMN IF NOT EXISTS fiscal_year integer,
  ADD COLUMN IF NOT EXISTS file_size_bytes bigint,
  ADD COLUMN IF NOT EXISTS options jsonb;

-- Cho phép thêm loại mới
ALTER TABLE public.system_backups DROP CONSTRAINT IF EXISTS system_backups_kind_check;
ALTER TABLE public.system_backups
  ADD CONSTRAINT system_backups_kind_check
  CHECK (kind IN ('tenant_export', 'fin_export', 'fin_import_snapshot'));

-- Bổ sung policy cho thành viên tenant (owner/accountant)
DROP POLICY IF EXISTS "tenant owner/acc read system_backups" ON public.system_backups;
CREATE POLICY "tenant owner/acc read system_backups"
ON public.system_backups
FOR SELECT
TO authenticated
USING (
  tenant_id IS NOT NULL
  AND public.has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','accountant'])
);

DROP POLICY IF EXISTS "tenant owner/acc insert system_backups" ON public.system_backups;
CREATE POLICY "tenant owner/acc insert system_backups"
ON public.system_backups
FOR INSERT
TO authenticated
WITH CHECK (
  tenant_id IS NOT NULL
  AND public.has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','accountant'])
);

DROP POLICY IF EXISTS "tenant owner/acc update system_backups" ON public.system_backups;
CREATE POLICY "tenant owner/acc update system_backups"
ON public.system_backups
FOR UPDATE
TO authenticated
USING (
  tenant_id IS NOT NULL
  AND public.has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','accountant'])
)
WITH CHECK (
  tenant_id IS NOT NULL
  AND public.has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','accountant'])
);

DROP POLICY IF EXISTS "tenant owner delete system_backups" ON public.system_backups;
CREATE POLICY "tenant owner delete system_backups"
ON public.system_backups
FOR DELETE
TO authenticated
USING (
  tenant_id IS NOT NULL
  AND public.has_tenant_role(auth.uid(), tenant_id, ARRAY['owner'])
);

CREATE INDEX IF NOT EXISTS idx_system_backups_tenant_year
  ON public.system_backups(tenant_id, fiscal_year DESC, created_at DESC);

-- ============================================================
-- 2. Storage bucket tenant-exports
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('tenant-exports', 'tenant-exports', false)
ON CONFLICT (id) DO NOTHING;

-- Path layout: {tenant_id}/{year}/{filename}
DROP POLICY IF EXISTS "tenant-exports read" ON storage.objects;
CREATE POLICY "tenant-exports read"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'tenant-exports'
  AND public.has_tenant_role(
        auth.uid(),
        ((storage.foldername(name))[1])::uuid,
        ARRAY['owner','accountant']
      )
);

DROP POLICY IF EXISTS "tenant-exports insert" ON storage.objects;
CREATE POLICY "tenant-exports insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'tenant-exports'
  AND public.has_tenant_role(
        auth.uid(),
        ((storage.foldername(name))[1])::uuid,
        ARRAY['owner','accountant']
      )
);

DROP POLICY IF EXISTS "tenant-exports delete" ON storage.objects;
CREATE POLICY "tenant-exports delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'tenant-exports'
  AND public.has_tenant_role(
        auth.uid(),
        ((storage.foldername(name))[1])::uuid,
        ARRAY['owner']
      )
);

-- ============================================================
-- 3. Hàm kết chuyển số dư sang năm sau
-- ============================================================
CREATE OR REPLACE FUNCTION public.carry_forward_balances(
  p_tenant uuid,
  p_from int,
  p_to int
)
RETURNS TABLE(account_code text, debit numeric, credit numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Chưa đăng nhập'; END IF;
  IF p_tenant IS NULL OR p_from IS NULL OR p_to IS NULL THEN
    RAISE EXCEPTION 'Thiếu tham số';
  END IF;
  IF p_to <= p_from THEN
    RAISE EXCEPTION 'Năm đích phải lớn hơn năm nguồn';
  END IF;
  IF NOT public.has_tenant_role(v_uid, p_tenant, ARRAY['owner','accountant']) THEN
    RAISE EXCEPTION 'Không có quyền kết chuyển số dư';
  END IF;

  -- Xoá số dư đầu kỳ cũ của năm đích để idempotent
  DELETE FROM public.account_period_balances
   WHERE tenant_id = p_tenant AND year = p_to AND period_no = 0;

  -- Lấy luỹ kế cuối năm nguồn (tổng 12 tháng) cho tài khoản lớp 1-4
  RETURN QUERY
  WITH yr AS (
    SELECT apb.account_code,
           SUM(apb.debit)  AS d,
           SUM(apb.credit) AS c
      FROM public.account_period_balances apb
     WHERE apb.tenant_id = p_tenant
       AND apb.year = p_from
       AND apb.period_no BETWEEN 0 AND 12
       AND substr(apb.account_code, 1, 1) IN ('1','2','3','4')
     GROUP BY apb.account_code
    HAVING ABS(COALESCE(SUM(apb.debit),0) - COALESCE(SUM(apb.credit),0)) > 0.005
  ),
  ins AS (
    INSERT INTO public.account_period_balances
      (tenant_id, account_code, year, period_no, debit, credit)
    SELECT p_tenant,
           yr.account_code,
           p_to,
           0,
           GREATEST(yr.d - yr.c, 0),
           GREATEST(yr.c - yr.d, 0)
      FROM yr
    RETURNING account_period_balances.account_code,
              account_period_balances.debit,
              account_period_balances.credit
  )
  SELECT ins.account_code, ins.debit, ins.credit FROM ins;
END $$;

REVOKE ALL ON FUNCTION public.carry_forward_balances(uuid, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.carry_forward_balances(uuid, int, int) TO authenticated;

-- ============================================================
-- 4. Hàm xoá dữ liệu năm (phục vụ Import "replace_year")
-- ============================================================
CREATE OR REPLACE FUNCTION public.delete_year_data(
  p_tenant uuid,
  p_year int
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_start date;
  v_end date;
  v_counts jsonb := '{}'::jsonb;
  v_n int;
  v_hard_locked int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Chưa đăng nhập'; END IF;
  IF NOT public.has_tenant_role(v_uid, p_tenant, ARRAY['owner']) THEN
    RAISE EXCEPTION 'Chỉ chủ tài khoản được xoá dữ liệu năm';
  END IF;

  SELECT COUNT(*) INTO v_hard_locked
    FROM public.fiscal_periods
   WHERE tenant_id = p_tenant AND year = p_year AND status = 'closed';
  IF v_hard_locked > 0 THEN
    RAISE EXCEPTION 'Năm % có % tháng đã khoá cứng — không thể xoá', p_year, v_hard_locked;
  END IF;

  v_start := make_date(p_year, 1, 1);
  v_end   := make_date(p_year, 12, 31);

  WITH d AS (
    DELETE FROM public.journal_lines l
      USING public.journal_entries e
     WHERE l.entry_id = e.id
       AND e.tenant_id = p_tenant
       AND e.entry_date BETWEEN v_start AND v_end
     RETURNING l.id
  ) SELECT count(*) INTO v_n FROM d;
  v_counts := v_counts || jsonb_build_object('journal_lines', v_n);

  DELETE FROM public.journal_entries
   WHERE tenant_id = p_tenant AND entry_date BETWEEN v_start AND v_end;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('journal_entries', v_n);

  DELETE FROM public.cash_vouchers
   WHERE tenant_id = p_tenant AND voucher_date BETWEEN v_start AND v_end;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('cash_vouchers', v_n);

  DELETE FROM public.bank_transactions
   WHERE tenant_id = p_tenant AND txn_date BETWEEN v_start AND v_end;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('bank_transactions', v_n);

  DELETE FROM public.account_period_balances
   WHERE tenant_id = p_tenant AND year = p_year;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('account_period_balances', v_n);

  RETURN v_counts;
END $$;

REVOKE ALL ON FUNCTION public.delete_year_data(uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_year_data(uuid, int) TO authenticated;
