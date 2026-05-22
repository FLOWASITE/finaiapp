
-- 1.1 Mở rộng bank_accounts
ALTER TABLE public.bank_accounts
  ADD COLUMN IF NOT EXISTS mb_username text,
  ADD COLUMN IF NOT EXISTS mb_password_enc text,
  ADD COLUMN IF NOT EXISTS mb_password_iv text,
  ADD COLUMN IF NOT EXISTS sync_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sync_interval_minutes int NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS last_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_sync_status text,
  ADD COLUMN IF NOT EXISTS last_sync_error text,
  ADD COLUMN IF NOT EXISTS current_balance numeric,
  ADD COLUMN IF NOT EXISTS balance_synced_at timestamptz;

-- 1.2 external_ref chống trùng
ALTER TABLE public.bank_transactions
  ADD COLUMN IF NOT EXISTS external_ref text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_bank_txn_external
  ON public.bank_transactions(bank_account_id, external_ref)
  WHERE external_ref IS NOT NULL;

-- 1.3 Bảng log đồng bộ
CREATE TABLE IF NOT EXISTS public.bank_sync_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid,
  bank_account_id uuid NOT NULL REFERENCES public.bank_accounts(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'running',
  txn_fetched int NOT NULL DEFAULT 0,
  txn_new int NOT NULL DEFAULT 0,
  error_text text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bank_sync_logs_acc ON public.bank_sync_logs(bank_account_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_bank_sync_logs_tenant ON public.bank_sync_logs(tenant_id);

ALTER TABLE public.bank_sync_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant bank_sync_logs select" ON public.bank_sync_logs
  FOR SELECT USING (tenant_id IS NOT NULL AND is_tenant_member(auth.uid(), tenant_id));

CREATE POLICY "tenant bank_sync_logs insert" ON public.bank_sync_logs
  FOR INSERT WITH CHECK (
    tenant_id IS NOT NULL AND tenant_id = current_tenant_id()
    AND has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin','accountant'])
  );

-- 1.4 Function auto-match giao dịch ngân hàng
CREATE OR REPLACE FUNCTION public.fn_auto_match_bank_txn(p_txn_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_txn public.bank_transactions%ROWTYPE;
  v_match_id uuid;
  v_match_count int := 0;
  v_confidence numeric := 0;
  v_reason text;
  v_desc_lower text;
BEGIN
  SELECT * INTO v_txn FROM public.bank_transactions WHERE id = p_txn_id;
  IF NOT FOUND OR v_txn.tenant_id IS NULL THEN RETURN; END IF;
  IF v_txn.status = 'matched' OR v_txn.matched_entry_id IS NOT NULL THEN RETURN; END IF;

  v_desc_lower := lower(COALESCE(v_txn.description, ''));

  IF v_txn.amount > 0 THEN
    -- Tiền vào → khớp customer_receipts
    SELECT count(*), max(id) INTO v_match_count, v_match_id
    FROM public.customer_receipts
    WHERE tenant_id = v_txn.tenant_id
      AND ABS(amount - v_txn.amount) < 0.5
      AND pay_date BETWEEN v_txn.txn_date - 3 AND v_txn.txn_date + 3
      AND COALESCE(status,'') <> 'void';

    IF v_match_count = 1 THEN
      v_confidence := 0.9;
      v_reason := 'amount+date exact';
      UPDATE public.bank_transactions
      SET status = 'matched',
          matched_entry_id = v_match_id,
          match_confidence = v_confidence,
          match_reason = v_reason
      WHERE id = p_txn_id;
    ELSIF v_match_count > 1 THEN
      UPDATE public.bank_transactions
      SET status = 'suggested',
          match_confidence = 0.5,
          match_reason = format('%s candidates', v_match_count)
      WHERE id = p_txn_id;
    END IF;
  ELSIF v_txn.amount < 0 THEN
    -- Tiền ra → khớp supplier_payments
    SELECT count(*), max(id) INTO v_match_count, v_match_id
    FROM public.supplier_payments
    WHERE tenant_id = v_txn.tenant_id
      AND ABS(amount - ABS(v_txn.amount)) < 0.5
      AND pay_date BETWEEN v_txn.txn_date - 3 AND v_txn.txn_date + 3
      AND COALESCE(status,'') <> 'void';

    IF v_match_count = 1 THEN
      UPDATE public.bank_transactions
      SET status = 'matched',
          matched_entry_id = v_match_id,
          match_confidence = 0.9,
          match_reason = 'amount+date exact'
      WHERE id = p_txn_id;
    ELSIF v_match_count > 1 THEN
      UPDATE public.bank_transactions
      SET status = 'suggested',
          match_confidence = 0.5,
          match_reason = format('%s candidates', v_match_count)
      WHERE id = p_txn_id;
    END IF;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.tg_bank_txn_auto_match()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.fn_auto_match_bank_txn(NEW.id);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_bank_txn_auto_match ON public.bank_transactions;
CREATE TRIGGER trg_bank_txn_auto_match
  AFTER INSERT ON public.bank_transactions
  FOR EACH ROW EXECUTE FUNCTION public.tg_bank_txn_auto_match();
