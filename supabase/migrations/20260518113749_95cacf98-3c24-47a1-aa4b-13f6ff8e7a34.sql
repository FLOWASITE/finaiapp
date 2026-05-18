
-- =========================================================
-- 0) Drop legacy CHECK constraints with conflicting vocabulary
-- =========================================================
ALTER TABLE public.invoices       DROP CONSTRAINT IF EXISTS invoices_status_check;
ALTER TABLE public.sales_invoices DROP CONSTRAINT IF EXISTS sales_invoices_status_check;

-- Drop legacy default on sales_invoices.status
ALTER TABLE public.sales_invoices ALTER COLUMN status DROP DEFAULT;

-- =========================================================
-- 1) documents, document_links, document_status_history
-- =========================================================

CREATE TABLE public.documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL,
  doc_kind text NOT NULL CHECK (doc_kind IN (
    'purchase_invoice','sales_invoice','einvoice',
    'cash_voucher','bank_voucher','receipt','payment',
    'contract','other'
  )),
  source text NOT NULL DEFAULT 'manual' CHECK (source IN (
    'manual','email','einvoice_sync','bank_import','api'
  )),
  storage_bucket text NOT NULL,
  storage_path text NOT NULL,
  original_filename text,
  mime_type text,
  size_bytes bigint,
  checksum_sha256 text,
  ocr_status text NOT NULL DEFAULT 'pending' CHECK (ocr_status IN (
    'pending','processing','done','failed'
  )),
  ocr_raw jsonb,
  ocr_extracted jsonb,
  reviewed_by uuid,
  reviewed_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, storage_bucket, storage_path)
);
CREATE UNIQUE INDEX idx_documents_checksum_unique
  ON public.documents(tenant_id, checksum_sha256)
  WHERE checksum_sha256 IS NOT NULL;
CREATE INDEX idx_documents_tenant_kind ON public.documents(tenant_id, doc_kind);

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.document_links (
  document_id uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  entity_table text NOT NULL CHECK (entity_table IN (
    'invoices','sales_invoices','einvoices',
    'cash_vouchers','bank_vouchers','customer_receipts','supplier_payments'
  )),
  entity_id uuid NOT NULL,
  link_type text NOT NULL DEFAULT 'attachment' CHECK (link_type IN (
    'source','attachment','evidence'
  )),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (document_id, entity_table, entity_id)
);
CREATE INDEX idx_document_links_entity ON public.document_links(entity_table, entity_id);
ALTER TABLE public.document_links ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.document_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  entity_table text NOT NULL,
  entity_id uuid NOT NULL,
  from_status text,
  to_status text NOT NULL,
  changed_by uuid,
  changed_at timestamptz NOT NULL DEFAULT now(),
  reason text
);
CREATE INDEX idx_doc_status_history_entity
  ON public.document_status_history(entity_table, entity_id, changed_at DESC);
ALTER TABLE public.document_status_history ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "own documents all" ON public.documents
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "tenant documents select" ON public.documents
  FOR SELECT USING (tenant_id IS NOT NULL AND is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "tenant documents insert" ON public.documents
  FOR INSERT WITH CHECK (
    tenant_id IS NOT NULL AND tenant_id = current_tenant_id()
    AND has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin','accountant'])
  );
CREATE POLICY "tenant documents update" ON public.documents
  FOR UPDATE USING (
    tenant_id IS NOT NULL AND has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin','accountant'])
  ) WITH CHECK (
    tenant_id IS NOT NULL AND has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin','accountant'])
  );
CREATE POLICY "tenant documents delete" ON public.documents
  FOR DELETE USING (
    tenant_id IS NOT NULL AND has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin','accountant'])
  );

CREATE POLICY "links via document select" ON public.document_links
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.documents d
    WHERE d.id = document_links.document_id
      AND is_tenant_member(auth.uid(), d.tenant_id)
  ));
CREATE POLICY "links via document write" ON public.document_links
  FOR ALL USING (EXISTS (
    SELECT 1 FROM public.documents d
    WHERE d.id = document_links.document_id
      AND has_tenant_role(auth.uid(), d.tenant_id, ARRAY['owner','admin','accountant'])
  )) WITH CHECK (EXISTS (
    SELECT 1 FROM public.documents d
    WHERE d.id = document_links.document_id
      AND has_tenant_role(auth.uid(), d.tenant_id, ARRAY['owner','admin','accountant'])
  ));

CREATE POLICY "status history select" ON public.document_status_history
  FOR SELECT USING (tenant_id IS NOT NULL AND is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "status history insert" ON public.document_status_history
  FOR INSERT WITH CHECK (tenant_id IS NOT NULL);  -- inserted by SECURITY DEFINER trigger

CREATE TRIGGER trg_documents_updated_at BEFORE UPDATE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================
-- 2) Add unified status column + posted_at/voided_at/void_reason
-- =========================================================

-- Tables that don't have a `status` column yet: einvoices, cash_vouchers, bank_vouchers,
-- customer_receipts, supplier_payments.  invoices & sales_invoices already have it.
ALTER TABLE public.einvoices         ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'uploaded';
ALTER TABLE public.cash_vouchers     ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'uploaded';
ALTER TABLE public.bank_vouchers     ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'uploaded';
ALTER TABLE public.customer_receipts ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'uploaded';
ALTER TABLE public.supplier_payments ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'uploaded';

-- Add posted_at/voided_at/void_reason on all 7 tables
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'invoices','sales_invoices','einvoices',
    'cash_vouchers','bank_vouchers','customer_receipts','supplier_payments'
  ] LOOP
    EXECUTE format($f$
      ALTER TABLE public.%1$I
        ADD COLUMN IF NOT EXISTS posted_at timestamptz,
        ADD COLUMN IF NOT EXISTS voided_at timestamptz,
        ADD COLUMN IF NOT EXISTS void_reason text;
    $f$, t);
  END LOOP;
END $$;

-- =========================================================
-- 3) Backfill status values to new vocabulary
-- =========================================================

-- invoices: 'extracted'→'ai_read', 'failed'→'rejected', 'pending'→'uploaded',
--           'approved'→'reviewed', plus posted if journal entry exists.
UPDATE public.invoices SET status = 'ai_read'  WHERE status = 'extracted';
UPDATE public.invoices SET status = 'rejected' WHERE status = 'failed';
UPDATE public.invoices SET status = 'uploaded' WHERE status = 'pending';
UPDATE public.invoices SET status = 'reviewed' WHERE status = 'approved';
UPDATE public.invoices i
SET status = 'posted', posted_at = COALESCE(i.posted_at, i.updated_at, now())
WHERE status NOT IN ('void','rejected')
  AND EXISTS (SELECT 1 FROM public.journal_entries je WHERE je.invoice_id = i.id);

-- sales_invoices currently empty — but normalise just in case
UPDATE public.sales_invoices SET status='reviewed' WHERE status='draft';
UPDATE public.sales_invoices SET status='reviewed' WHERE status='issued';
UPDATE public.sales_invoices SET status='void'    WHERE status='cancelled';

-- einvoices: leave 'uploaded' default; mark reviewed if matched
UPDATE public.einvoices SET status='reviewed'
WHERE status='uploaded'
  AND (matched_sales_invoice_id IS NOT NULL OR matched_purchase_invoice_id IS NOT NULL);

-- vouchers, receipts, payments
UPDATE public.cash_vouchers     SET status='posted',  posted_at=COALESCE(created_at, now()) WHERE journal_entry_id IS NOT NULL;
UPDATE public.bank_vouchers     SET status='posted',  posted_at=COALESCE(created_at, now()) WHERE journal_entry_id IS NOT NULL;
UPDATE public.customer_receipts SET status='posted',  posted_at=COALESCE(created_at, now()) WHERE journal_entry_id IS NOT NULL;
UPDATE public.supplier_payments SET status='posted',  posted_at=COALESCE(created_at, now()) WHERE journal_entry_id IS NOT NULL;

UPDATE public.cash_vouchers     SET status='reviewed' WHERE status='uploaded' AND journal_entry_id IS NULL;
UPDATE public.bank_vouchers     SET status='reviewed' WHERE status='uploaded' AND journal_entry_id IS NULL;
UPDATE public.customer_receipts SET status='reviewed' WHERE status='uploaded' AND journal_entry_id IS NULL;
UPDATE public.supplier_payments SET status='reviewed' WHERE status='uploaded' AND journal_entry_id IS NULL;

-- =========================================================
-- 4) Add unified CHECK constraints
-- =========================================================
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'invoices','sales_invoices','einvoices',
    'cash_vouchers','bank_vouchers','customer_receipts','supplier_payments'
  ] LOOP
    EXECUTE format($f$
      ALTER TABLE public.%1$I
        ADD CONSTRAINT %1$s_doc_status_check
        CHECK (status IN ('uploaded','ai_read','reviewed','posted','void','rejected'));
    $f$, t);
  END LOOP;
END $$;

-- Update default values to the new vocabulary
ALTER TABLE public.invoices       ALTER COLUMN status SET DEFAULT 'uploaded';
ALTER TABLE public.sales_invoices ALTER COLUMN status SET DEFAULT 'reviewed';

-- =========================================================
-- 5) State machine trigger + history logger
-- =========================================================
CREATE OR REPLACE FUNCTION public.enforce_document_status_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old text := OLD.status;
  v_new text := NEW.status;
  v_allowed boolean := false;
  v_je uuid;
  v_date date;
BEGIN
  IF v_old IS NOT DISTINCT FROM v_new THEN RETURN NEW; END IF;

  IF current_setting('app.bypass_status_machine', true) = 'on' THEN
    RETURN NEW;
  END IF;

  v_allowed := CASE v_old
    WHEN 'uploaded' THEN v_new IN ('ai_read','reviewed','void','rejected')
    WHEN 'ai_read'  THEN v_new IN ('reviewed','void','rejected')
    WHEN 'reviewed' THEN v_new IN ('posted','ai_read','void')
    WHEN 'posted'   THEN v_new IN ('void','reviewed')
    WHEN 'void'     THEN false
    WHEN 'rejected' THEN v_new IN ('uploaded')
    ELSE false
  END;
  IF NOT v_allowed THEN
    RAISE EXCEPTION 'Chuyển trạng thái không hợp lệ: % → %', v_old, v_new;
  END IF;

  IF v_new = 'posted' THEN
    BEGIN v_je := (to_jsonb(NEW)->>'journal_entry_id')::uuid;
    EXCEPTION WHEN others THEN v_je := NULL; END;
    IF v_je IS NULL THEN
      RAISE EXCEPTION 'Phải có bút toán (journal_entry_id) trước khi chuyển sang ghi sổ';
    END IF;
    NEW.posted_at := COALESCE(NEW.posted_at, now());
  END IF;

  IF v_new = 'void' THEN
    NEW.voided_at := COALESCE(NEW.voided_at, now());
  END IF;

  -- Period lock guard
  BEGIN
    v_date := COALESCE(
      (to_jsonb(NEW)->>'issue_date')::date,
      (to_jsonb(NEW)->>'voucher_date')::date,
      (to_jsonb(NEW)->>'pay_date')::date
    );
  EXCEPTION WHEN others THEN v_date := NULL; END;

  IF v_date IS NOT NULL AND NEW.user_id IS NOT NULL THEN
    IF public.is_period_locked(NEW.user_id, v_date) AND v_old = 'posted' THEN
      RAISE EXCEPTION 'Kỳ kế toán đã khoá — không thể đổi trạng thái chứng từ này';
    END IF;
  END IF;

  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.log_document_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.document_status_history
      (tenant_id, entity_table, entity_id, from_status, to_status, changed_by, reason)
    VALUES
      (NEW.tenant_id, TG_TABLE_NAME, NEW.id, OLD.status, NEW.status, auth.uid(),
       NULLIF(current_setting('app.status_change_reason', true), ''));
  END IF;
  RETURN NEW;
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'invoices','sales_invoices','einvoices',
    'cash_vouchers','bank_vouchers','customer_receipts','supplier_payments'
  ] LOOP
    EXECUTE format($f$
      CREATE TRIGGER trg_%1$s_status_enforce
        BEFORE UPDATE OF status ON public.%1$I
        FOR EACH ROW EXECUTE FUNCTION public.enforce_document_status_transition();
      CREATE TRIGGER trg_%1$s_status_log
        AFTER UPDATE OF status ON public.%1$I
        FOR EACH ROW EXECUTE FUNCTION public.log_document_status_change();
    $f$, t);
  END LOOP;
END $$;

-- =========================================================
-- 6) RPC for app
-- =========================================================
CREATE OR REPLACE FUNCTION public.transition_document_status(
  p_table text, p_id uuid, p_to_status text, p_reason text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_allowed_tables text[] := ARRAY[
    'invoices','sales_invoices','einvoices',
    'cash_vouchers','bank_vouchers','customer_receipts','supplier_payments'
  ];
BEGIN
  IF NOT p_table = ANY(v_allowed_tables) THEN
    RAISE EXCEPTION 'Bảng không hợp lệ: %', p_table;
  END IF;
  IF p_reason IS NOT NULL THEN
    PERFORM set_config('app.status_change_reason', p_reason, true);
  END IF;
  EXECUTE format(
    'UPDATE public.%I SET status = $1, void_reason = COALESCE($2, void_reason) WHERE id = $3',
    p_table
  ) USING p_to_status, CASE WHEN p_to_status='void' THEN p_reason END, p_id;
END $$;

GRANT EXECUTE ON FUNCTION public.transition_document_status(text, uuid, text, text) TO authenticated;
