
-- =====================================================================
-- 1.1 COMPOSITE INDEXES
-- =====================================================================
CREATE INDEX IF NOT EXISTS idx_je_tenant_date
  ON public.journal_entries (tenant_id, entry_date DESC);
CREATE INDEX IF NOT EXISTS idx_je_tenant_date_id
  ON public.journal_entries (tenant_id, entry_date DESC, id);
CREATE INDEX IF NOT EXISTS idx_jl_account_code
  ON public.journal_lines (account_code);
CREATE INDEX IF NOT EXISTS idx_inv_tenant_date_status
  ON public.invoices (tenant_id, issue_date DESC, status);
CREATE INDEX IF NOT EXISTS idx_sinv_tenant_date_status
  ON public.sales_invoices (tenant_id, issue_date DESC, status);
CREATE INDEX IF NOT EXISTS idx_creceipts_tenant_date
  ON public.customer_receipts (tenant_id, pay_date DESC);
CREATE INDEX IF NOT EXISTS idx_spayments_tenant_date
  ON public.supplier_payments (tenant_id, pay_date DESC);
CREATE INDEX IF NOT EXISTS idx_documents_tenant_sha
  ON public.documents (tenant_id, checksum_sha256) WHERE checksum_sha256 IS NOT NULL;

-- =====================================================================
-- 1.2 PERIOD SEAL + UNSEAL 2-SIGNATURE
-- =====================================================================
ALTER TABLE public.fiscal_periods
  ADD COLUMN IF NOT EXISTS is_sealed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sealed_at timestamptz,
  ADD COLUMN IF NOT EXISTS sealed_by uuid,
  ADD COLUMN IF NOT EXISTS seal_reason text;

CREATE INDEX IF NOT EXISTS idx_fiscal_periods_sealed
  ON public.fiscal_periods (tenant_id, year, period_no) WHERE is_sealed = true;

CREATE TABLE IF NOT EXISTS public.fiscal_period_unseal_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  period_id uuid NOT NULL REFERENCES public.fiscal_periods(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL,
  requested_role text NOT NULL CHECK (requested_role IN ('owner','admin')),
  reason text NOT NULL,
  approved_by uuid,
  approved_role text CHECK (approved_role IN ('owner','admin')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','expired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '48 hours'),
  rejection_reason text
);

GRANT SELECT, INSERT, UPDATE ON public.fiscal_period_unseal_requests TO authenticated;
GRANT ALL ON public.fiscal_period_unseal_requests TO service_role;

ALTER TABLE public.fiscal_period_unseal_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant members can view unseal requests"
  ON public.fiscal_period_unseal_requests FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.tenant_members tm
    WHERE tm.tenant_id = fiscal_period_unseal_requests.tenant_id
      AND tm.user_id = auth.uid() AND tm.status = 'active'
  ));

CREATE POLICY "owner/admin can create unseal requests"
  ON public.fiscal_period_unseal_requests FOR INSERT TO authenticated
  WITH CHECK (
    requested_by = auth.uid()
    AND public.has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin'])
  );

CREATE POLICY "owner/admin can update unseal requests"
  ON public.fiscal_period_unseal_requests FOR UPDATE TO authenticated
  USING (public.has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin']));

CREATE INDEX IF NOT EXISTS idx_unseal_req_period ON public.fiscal_period_unseal_requests(period_id, status);
CREATE INDEX IF NOT EXISTS idx_unseal_req_tenant_status ON public.fiscal_period_unseal_requests(tenant_id, status);

-- Trigger functions
CREATE OR REPLACE FUNCTION public.assert_period_not_sealed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_date date; v_tenant uuid; v_sealed boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_tenant := OLD.tenant_id;
    v_date := CASE TG_TABLE_NAME
      WHEN 'journal_entries' THEN OLD.entry_date
      WHEN 'invoices' THEN OLD.issue_date
      WHEN 'sales_invoices' THEN OLD.issue_date
      WHEN 'customer_receipts' THEN OLD.pay_date
      WHEN 'supplier_payments' THEN OLD.pay_date
    END;
  ELSE
    v_tenant := NEW.tenant_id;
    v_date := CASE TG_TABLE_NAME
      WHEN 'journal_entries' THEN NEW.entry_date
      WHEN 'invoices' THEN NEW.issue_date
      WHEN 'sales_invoices' THEN NEW.issue_date
      WHEN 'customer_receipts' THEN NEW.pay_date
      WHEN 'supplier_payments' THEN NEW.pay_date
    END;
  END IF;

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

CREATE OR REPLACE FUNCTION public.assert_jl_period_not_sealed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_date date; v_tenant uuid; v_sealed boolean;
BEGIN
  SELECT entry_date, tenant_id INTO v_date, v_tenant
  FROM public.journal_entries WHERE id = COALESCE(NEW.entry_id, OLD.entry_id);

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
    RAISE EXCEPTION 'Kỳ kế toán % đã được niêm phong. Không thể thay đổi chi tiết bút toán.',
      to_char(v_date, 'MM/YYYY')
      USING ERRCODE = 'P0001';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_seal_check_je ON public.journal_entries;
CREATE TRIGGER trg_seal_check_je BEFORE INSERT OR UPDATE OR DELETE ON public.journal_entries
  FOR EACH ROW EXECUTE FUNCTION public.assert_period_not_sealed();

DROP TRIGGER IF EXISTS trg_seal_check_jl ON public.journal_lines;
CREATE TRIGGER trg_seal_check_jl BEFORE INSERT OR UPDATE OR DELETE ON public.journal_lines
  FOR EACH ROW EXECUTE FUNCTION public.assert_jl_period_not_sealed();

DROP TRIGGER IF EXISTS trg_seal_check_inv ON public.invoices;
CREATE TRIGGER trg_seal_check_inv BEFORE INSERT OR UPDATE OR DELETE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.assert_period_not_sealed();

DROP TRIGGER IF EXISTS trg_seal_check_sinv ON public.sales_invoices;
CREATE TRIGGER trg_seal_check_sinv BEFORE INSERT OR UPDATE OR DELETE ON public.sales_invoices
  FOR EACH ROW EXECUTE FUNCTION public.assert_period_not_sealed();

DROP TRIGGER IF EXISTS trg_seal_check_cr ON public.customer_receipts;
CREATE TRIGGER trg_seal_check_cr BEFORE INSERT OR UPDATE OR DELETE ON public.customer_receipts
  FOR EACH ROW EXECUTE FUNCTION public.assert_period_not_sealed();

DROP TRIGGER IF EXISTS trg_seal_check_sp ON public.supplier_payments;
CREATE TRIGGER trg_seal_check_sp BEFORE INSERT OR UPDATE OR DELETE ON public.supplier_payments
  FOR EACH ROW EXECUTE FUNCTION public.assert_period_not_sealed();

-- RPCs
CREATE OR REPLACE FUNCTION public.seal_fiscal_period(p_period_id uuid, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_uid uuid := auth.uid(); v_tenant uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Chưa đăng nhập'; END IF;
  SELECT tenant_id INTO v_tenant FROM public.fiscal_periods WHERE id = p_period_id;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Không tìm thấy kỳ kế toán'; END IF;
  IF NOT public.has_tenant_role(v_uid, v_tenant, ARRAY['owner']) THEN
    RAISE EXCEPTION 'Chỉ chủ doanh nghiệp được quyền niêm phong kỳ';
  END IF;
  UPDATE public.fiscal_periods
    SET is_sealed = true, sealed_at = now(), sealed_by = v_uid, seal_reason = p_reason,
        status = 'closed', closed_at = COALESCE(closed_at, now()),
        closed_by = COALESCE(closed_by, v_uid)
  WHERE id = p_period_id;

  INSERT INTO public.audit_logs(tenant_id, user_id, action, table_name, record_id, after)
  VALUES (v_tenant, v_uid, 'seal_fiscal_period', 'fiscal_periods', p_period_id,
          jsonb_build_object('reason', p_reason));
END;
$$;

CREATE OR REPLACE FUNCTION public.request_unseal_period(p_period_id uuid, p_reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_uid uuid := auth.uid(); v_tenant uuid; v_role text; v_req_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Chưa đăng nhập'; END IF;
  SELECT tenant_id INTO v_tenant FROM public.fiscal_periods WHERE id = p_period_id AND is_sealed = true;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Kỳ không tồn tại hoặc chưa niêm phong'; END IF;
  IF public.has_tenant_role(v_uid, v_tenant, ARRAY['owner']) THEN v_role := 'owner';
  ELSIF public.has_tenant_role(v_uid, v_tenant, ARRAY['admin']) THEN v_role := 'admin';
  ELSE RAISE EXCEPTION 'Chỉ chủ DN hoặc quản trị viên được gửi yêu cầu mở niêm phong'; END IF;

  UPDATE public.fiscal_period_unseal_requests
    SET status = 'expired' WHERE period_id = p_period_id AND status = 'pending';

  INSERT INTO public.fiscal_period_unseal_requests(tenant_id, period_id, requested_by, requested_role, reason)
  VALUES (v_tenant, p_period_id, v_uid, v_role, p_reason)
  RETURNING id INTO v_req_id;

  INSERT INTO public.audit_logs(tenant_id, user_id, action, table_name, record_id, after)
  VALUES (v_tenant, v_uid, 'request_unseal_period', 'fiscal_periods', p_period_id,
          jsonb_build_object('reason', p_reason, 'request_id', v_req_id));
  RETURN v_req_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_unseal_period(p_request_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_uid uuid := auth.uid(); v_req public.fiscal_period_unseal_requests%ROWTYPE; v_approver_role text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Chưa đăng nhập'; END IF;
  SELECT * INTO v_req FROM public.fiscal_period_unseal_requests WHERE id = p_request_id;
  IF v_req.id IS NULL THEN RAISE EXCEPTION 'Không tìm thấy yêu cầu'; END IF;
  IF v_req.status <> 'pending' THEN RAISE EXCEPTION 'Yêu cầu đã được xử lý hoặc hết hạn'; END IF;
  IF v_req.expires_at < now() THEN
    UPDATE public.fiscal_period_unseal_requests SET status = 'expired' WHERE id = p_request_id;
    RAISE EXCEPTION 'Yêu cầu đã hết hạn';
  END IF;
  IF v_uid = v_req.requested_by THEN
    RAISE EXCEPTION 'Người gửi yêu cầu không thể tự phê duyệt — cần chữ ký thứ 2';
  END IF;
  IF v_req.requested_role = 'owner' THEN
    IF NOT public.has_tenant_role(v_uid, v_req.tenant_id, ARRAY['admin']) THEN
      RAISE EXCEPTION 'Cần quản trị viên (admin) phê duyệt';
    END IF;
    v_approver_role := 'admin';
  ELSE
    IF NOT public.has_tenant_role(v_uid, v_req.tenant_id, ARRAY['owner']) THEN
      RAISE EXCEPTION 'Cần chủ doanh nghiệp phê duyệt';
    END IF;
    v_approver_role := 'owner';
  END IF;

  UPDATE public.fiscal_period_unseal_requests
    SET status = 'approved', approved_by = v_uid, approved_role = v_approver_role, approved_at = now()
    WHERE id = p_request_id;

  UPDATE public.fiscal_periods
    SET is_sealed = false, sealed_at = NULL, sealed_by = NULL, seal_reason = NULL
    WHERE id = v_req.period_id;

  INSERT INTO public.audit_logs(tenant_id, user_id, action, table_name, record_id, after)
  VALUES (v_req.tenant_id, v_uid, 'approve_unseal_period', 'fiscal_periods', v_req.period_id,
          jsonb_build_object('request_id', p_request_id, 'requested_by', v_req.requested_by));
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_unseal_period(p_request_id uuid, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_uid uuid := auth.uid(); v_req public.fiscal_period_unseal_requests%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Chưa đăng nhập'; END IF;
  SELECT * INTO v_req FROM public.fiscal_period_unseal_requests WHERE id = p_request_id;
  IF v_req.id IS NULL THEN RAISE EXCEPTION 'Không tìm thấy yêu cầu'; END IF;
  IF v_uid = v_req.requested_by THEN
    UPDATE public.fiscal_period_unseal_requests
      SET status = 'rejected', rejection_reason = COALESCE(p_reason,'Người gửi tự huỷ'), approved_at = now()
      WHERE id = p_request_id;
  ELSE
    IF NOT public.has_tenant_role(v_uid, v_req.tenant_id, ARRAY['owner','admin']) THEN
      RAISE EXCEPTION 'Không có quyền từ chối';
    END IF;
    UPDATE public.fiscal_period_unseal_requests
      SET status = 'rejected', approved_by = v_uid, rejection_reason = p_reason, approved_at = now()
      WHERE id = p_request_id;
  END IF;
END;
$$;

-- =====================================================================
-- 1.3 ACCOUNT BALANCE YEARLY
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.account_balance_yearly (
  tenant_id uuid NOT NULL,
  account_code text NOT NULL,
  year int NOT NULL,
  opening_debit numeric(20,2) NOT NULL DEFAULT 0,
  opening_credit numeric(20,2) NOT NULL DEFAULT 0,
  period_debit numeric(20,2) NOT NULL DEFAULT 0,
  period_credit numeric(20,2) NOT NULL DEFAULT 0,
  closing_debit numeric(20,2) NOT NULL DEFAULT 0,
  closing_credit numeric(20,2) NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, account_code, year)
);

GRANT SELECT ON public.account_balance_yearly TO authenticated;
GRANT ALL ON public.account_balance_yearly TO service_role;

ALTER TABLE public.account_balance_yearly ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant members can view yearly balances"
  ON public.account_balance_yearly FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.tenant_members tm
    WHERE tm.tenant_id = account_balance_yearly.tenant_id
      AND tm.user_id = auth.uid() AND tm.status = 'active'
  ));

CREATE INDEX IF NOT EXISTS idx_aby_tenant_year ON public.account_balance_yearly(tenant_id, year);

CREATE OR REPLACE FUNCTION public.rebuild_account_balance_yearly(p_tenant uuid DEFAULT NULL, p_year int DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF p_tenant IS NULL AND p_year IS NULL THEN
    DELETE FROM public.account_balance_yearly;
  ELSIF p_tenant IS NOT NULL AND p_year IS NULL THEN
    DELETE FROM public.account_balance_yearly WHERE tenant_id = p_tenant;
  ELSIF p_tenant IS NOT NULL AND p_year IS NOT NULL THEN
    DELETE FROM public.account_balance_yearly WHERE tenant_id = p_tenant AND year = p_year;
  ELSE
    DELETE FROM public.account_balance_yearly WHERE year = p_year;
  END IF;

  INSERT INTO public.account_balance_yearly
    (tenant_id, account_code, year, period_debit, period_credit, closing_debit, closing_credit, updated_at)
  SELECT
    tenant_id, account_code, year,
    SUM(debit), SUM(credit),
    GREATEST(SUM(debit) - SUM(credit), 0),
    GREATEST(SUM(credit) - SUM(debit), 0),
    now()
  FROM public.account_period_balances
  WHERE (p_tenant IS NULL OR tenant_id = p_tenant)
    AND (p_year IS NULL OR year = p_year)
  GROUP BY tenant_id, account_code, year;
END;
$$;
