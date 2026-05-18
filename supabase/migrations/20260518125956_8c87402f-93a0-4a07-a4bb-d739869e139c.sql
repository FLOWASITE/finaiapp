
-- ============================================================
-- 1) account_period_balances
-- ============================================================
CREATE TABLE IF NOT EXISTS public.account_period_balances (
  tenant_id uuid NOT NULL,
  account_code text NOT NULL,
  year int NOT NULL,
  period_no int NOT NULL,
  debit numeric(20,2) NOT NULL DEFAULT 0,
  credit numeric(20,2) NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, account_code, year, period_no)
);
CREATE INDEX IF NOT EXISTS idx_apb_tenant_year ON public.account_period_balances (tenant_id, year, period_no);
CREATE INDEX IF NOT EXISTS idx_apb_tenant_account ON public.account_period_balances (tenant_id, account_code);

ALTER TABLE public.account_period_balances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant read account_period_balances" ON public.account_period_balances;
CREATE POLICY "tenant read account_period_balances" ON public.account_period_balances
  FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id());

-- ============================================================
-- 2) monthly_summary
-- ============================================================
CREATE TABLE IF NOT EXISTS public.monthly_summary (
  tenant_id uuid NOT NULL,
  year_month text NOT NULL, -- 'YYYY-MM'
  sales_revenue numeric(20,2) NOT NULL DEFAULT 0,
  sales_count int NOT NULL DEFAULT 0,
  collected numeric(20,2) NOT NULL DEFAULT 0,
  purchase_expense numeric(20,2) NOT NULL DEFAULT 0,
  purchase_count int NOT NULL DEFAULT 0,
  paid numeric(20,2) NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, year_month)
);

ALTER TABLE public.monthly_summary ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant read monthly_summary" ON public.monthly_summary;
CREATE POLICY "tenant read monthly_summary" ON public.monthly_summary
  FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id());

-- ============================================================
-- 3) Helpers
-- ============================================================
CREATE OR REPLACE FUNCTION public.apply_balance_delta(
  p_tenant uuid, p_account text, p_date date, p_debit numeric, p_credit numeric
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_year int;
  v_period int;
BEGIN
  IF p_tenant IS NULL OR p_account IS NULL OR p_date IS NULL THEN RETURN; END IF;
  v_year := EXTRACT(YEAR FROM p_date)::int;
  v_period := EXTRACT(MONTH FROM p_date)::int;
  INSERT INTO public.account_period_balances(tenant_id, account_code, year, period_no, debit, credit)
  VALUES (p_tenant, p_account, v_year, v_period, COALESCE(p_debit,0), COALESCE(p_credit,0))
  ON CONFLICT (tenant_id, account_code, year, period_no) DO UPDATE
  SET debit = account_period_balances.debit + EXCLUDED.debit,
      credit = account_period_balances.credit + EXCLUDED.credit,
      updated_at = now();
END $$;

CREATE OR REPLACE FUNCTION public.apply_monthly_summary(
  p_tenant uuid, p_date date,
  p_sales_revenue numeric, p_sales_count int,
  p_collected numeric,
  p_purchase_expense numeric, p_purchase_count int,
  p_paid numeric
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ym text;
BEGIN
  IF p_tenant IS NULL OR p_date IS NULL THEN RETURN; END IF;
  v_ym := to_char(p_date, 'YYYY-MM');
  INSERT INTO public.monthly_summary(tenant_id, year_month,
    sales_revenue, sales_count, collected, purchase_expense, purchase_count, paid)
  VALUES (p_tenant, v_ym,
    COALESCE(p_sales_revenue,0), COALESCE(p_sales_count,0),
    COALESCE(p_collected,0), COALESCE(p_purchase_expense,0),
    COALESCE(p_purchase_count,0), COALESCE(p_paid,0))
  ON CONFLICT (tenant_id, year_month) DO UPDATE SET
    sales_revenue    = monthly_summary.sales_revenue    + EXCLUDED.sales_revenue,
    sales_count      = monthly_summary.sales_count      + EXCLUDED.sales_count,
    collected        = monthly_summary.collected        + EXCLUDED.collected,
    purchase_expense = monthly_summary.purchase_expense + EXCLUDED.purchase_expense,
    purchase_count   = monthly_summary.purchase_count   + EXCLUDED.purchase_count,
    paid             = monthly_summary.paid             + EXCLUDED.paid,
    updated_at = now();
END $$;

-- ============================================================
-- 4) Triggers: journal_lines -> account_period_balances
-- ============================================================
CREATE OR REPLACE FUNCTION public.tg_journal_lines_balance()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant uuid;
  v_date date;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT tenant_id, entry_date INTO v_tenant, v_date
      FROM public.journal_entries WHERE id = OLD.entry_id;
    PERFORM public.apply_balance_delta(v_tenant, OLD.account_code, v_date, -OLD.debit, -OLD.credit);
    RETURN OLD;
  ELSIF TG_OP = 'INSERT' THEN
    SELECT tenant_id, entry_date INTO v_tenant, v_date
      FROM public.journal_entries WHERE id = NEW.entry_id;
    PERFORM public.apply_balance_delta(v_tenant, NEW.account_code, v_date, NEW.debit, NEW.credit);
    RETURN NEW;
  ELSE
    SELECT tenant_id, entry_date INTO v_tenant, v_date
      FROM public.journal_entries WHERE id = NEW.entry_id;
    PERFORM public.apply_balance_delta(v_tenant, OLD.account_code, v_date, -OLD.debit, -OLD.credit);
    PERFORM public.apply_balance_delta(v_tenant, NEW.account_code, v_date, NEW.debit, NEW.credit);
    RETURN NEW;
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_journal_lines_balance ON public.journal_lines;
CREATE TRIGGER trg_journal_lines_balance
AFTER INSERT OR UPDATE OR DELETE ON public.journal_lines
FOR EACH ROW EXECUTE FUNCTION public.tg_journal_lines_balance();

-- Handle entry_date / tenant_id change on parent journal_entries
CREATE OR REPLACE FUNCTION public.tg_journal_entries_balance_resync()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
  IF NEW.entry_date IS DISTINCT FROM OLD.entry_date
     OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
    FOR r IN SELECT account_code, debit, credit FROM public.journal_lines WHERE entry_id = NEW.id LOOP
      PERFORM public.apply_balance_delta(OLD.tenant_id, r.account_code, OLD.entry_date, -r.debit, -r.credit);
      PERFORM public.apply_balance_delta(NEW.tenant_id, r.account_code, NEW.entry_date, r.debit, r.credit);
    END LOOP;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_journal_entries_balance_resync ON public.journal_entries;
CREATE TRIGGER trg_journal_entries_balance_resync
AFTER UPDATE ON public.journal_entries
FOR EACH ROW EXECUTE FUNCTION public.tg_journal_entries_balance_resync();

-- ============================================================
-- 5) Triggers: monthly_summary
-- ============================================================

-- sales_invoices -> sales_revenue / sales_count
CREATE OR REPLACE FUNCTION public.tg_sales_invoices_summary()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_old_active bool := (TG_OP IN ('UPDATE','DELETE')) AND (OLD.status IS DISTINCT FROM 'void');
  v_new_active bool := (TG_OP IN ('INSERT','UPDATE')) AND (NEW.status IS DISTINCT FROM 'void');
BEGIN
  IF v_old_active THEN
    PERFORM public.apply_monthly_summary(OLD.tenant_id, OLD.issue_date,
      -COALESCE(OLD.total,0), -1, 0, 0, 0, 0);
  END IF;
  IF v_new_active THEN
    PERFORM public.apply_monthly_summary(NEW.tenant_id, NEW.issue_date,
      COALESCE(NEW.total,0), 1, 0, 0, 0, 0);
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;
DROP TRIGGER IF EXISTS trg_sales_invoices_summary ON public.sales_invoices;
CREATE TRIGGER trg_sales_invoices_summary
AFTER INSERT OR UPDATE OR DELETE ON public.sales_invoices
FOR EACH ROW EXECUTE FUNCTION public.tg_sales_invoices_summary();

-- invoices (purchases) -> purchase_expense / purchase_count
CREATE OR REPLACE FUNCTION public.tg_invoices_summary()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_old_active bool := (TG_OP IN ('UPDATE','DELETE')) AND (OLD.status IS DISTINCT FROM 'void');
  v_new_active bool := (TG_OP IN ('INSERT','UPDATE')) AND (NEW.status IS DISTINCT FROM 'void');
BEGIN
  IF v_old_active AND OLD.issue_date IS NOT NULL THEN
    PERFORM public.apply_monthly_summary(OLD.tenant_id, OLD.issue_date,
      0, 0, 0, -COALESCE(OLD.total,0), -1, 0);
  END IF;
  IF v_new_active AND NEW.issue_date IS NOT NULL THEN
    PERFORM public.apply_monthly_summary(NEW.tenant_id, NEW.issue_date,
      0, 0, 0, COALESCE(NEW.total,0), 1, 0);
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;
DROP TRIGGER IF EXISTS trg_invoices_summary ON public.invoices;
CREATE TRIGGER trg_invoices_summary
AFTER INSERT OR UPDATE OR DELETE ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.tg_invoices_summary();

-- customer_receipts -> collected
CREATE OR REPLACE FUNCTION public.tg_customer_receipts_summary()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') THEN
    PERFORM public.apply_monthly_summary(OLD.tenant_id, OLD.pay_date,
      0, 0, -COALESCE(OLD.amount,0), 0, 0, 0);
  END IF;
  IF TG_OP IN ('INSERT','UPDATE') THEN
    PERFORM public.apply_monthly_summary(NEW.tenant_id, NEW.pay_date,
      0, 0, COALESCE(NEW.amount,0), 0, 0, 0);
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;
DROP TRIGGER IF EXISTS trg_customer_receipts_summary ON public.customer_receipts;
CREATE TRIGGER trg_customer_receipts_summary
AFTER INSERT OR UPDATE OR DELETE ON public.customer_receipts
FOR EACH ROW EXECUTE FUNCTION public.tg_customer_receipts_summary();

-- supplier_payments -> paid
CREATE OR REPLACE FUNCTION public.tg_supplier_payments_summary()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') THEN
    PERFORM public.apply_monthly_summary(OLD.tenant_id, OLD.pay_date,
      0, 0, 0, 0, 0, -COALESCE(OLD.amount,0));
  END IF;
  IF TG_OP IN ('INSERT','UPDATE') THEN
    PERFORM public.apply_monthly_summary(NEW.tenant_id, NEW.pay_date,
      0, 0, 0, 0, 0, COALESCE(NEW.amount,0));
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;
DROP TRIGGER IF EXISTS trg_supplier_payments_summary ON public.supplier_payments;
CREATE TRIGGER trg_supplier_payments_summary
AFTER INSERT OR UPDATE OR DELETE ON public.supplier_payments
FOR EACH ROW EXECUTE FUNCTION public.tg_supplier_payments_summary();

-- ============================================================
-- 6) Backfill functions
-- ============================================================
CREATE OR REPLACE FUNCTION public.rebuild_account_period_balances(p_tenant uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_tenant IS NULL THEN
    DELETE FROM public.account_period_balances;
  ELSE
    DELETE FROM public.account_period_balances WHERE tenant_id = p_tenant;
  END IF;
  INSERT INTO public.account_period_balances(tenant_id, account_code, year, period_no, debit, credit)
  SELECT e.tenant_id, l.account_code,
         EXTRACT(YEAR FROM e.entry_date)::int,
         EXTRACT(MONTH FROM e.entry_date)::int,
         SUM(l.debit), SUM(l.credit)
  FROM public.journal_lines l
  JOIN public.journal_entries e ON e.id = l.entry_id
  WHERE e.tenant_id IS NOT NULL
    AND (p_tenant IS NULL OR e.tenant_id = p_tenant)
  GROUP BY 1,2,3,4;
END $$;

CREATE OR REPLACE FUNCTION public.rebuild_monthly_summary(p_tenant uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_tenant IS NULL THEN
    DELETE FROM public.monthly_summary;
  ELSE
    DELETE FROM public.monthly_summary WHERE tenant_id = p_tenant;
  END IF;

  -- Sales
  INSERT INTO public.monthly_summary(tenant_id, year_month, sales_revenue, sales_count)
  SELECT tenant_id, to_char(issue_date,'YYYY-MM'), SUM(COALESCE(total,0)), COUNT(*)
  FROM public.sales_invoices
  WHERE tenant_id IS NOT NULL AND status IS DISTINCT FROM 'void'
    AND (p_tenant IS NULL OR tenant_id = p_tenant)
  GROUP BY 1,2
  ON CONFLICT (tenant_id, year_month) DO UPDATE SET
    sales_revenue = EXCLUDED.sales_revenue,
    sales_count = EXCLUDED.sales_count,
    updated_at = now();

  -- Purchases
  INSERT INTO public.monthly_summary(tenant_id, year_month, purchase_expense, purchase_count)
  SELECT tenant_id, to_char(issue_date,'YYYY-MM'), SUM(COALESCE(total,0)), COUNT(*)
  FROM public.invoices
  WHERE tenant_id IS NOT NULL AND issue_date IS NOT NULL
    AND status IS DISTINCT FROM 'void'
    AND (p_tenant IS NULL OR tenant_id = p_tenant)
  GROUP BY 1,2
  ON CONFLICT (tenant_id, year_month) DO UPDATE SET
    purchase_expense = EXCLUDED.purchase_expense,
    purchase_count = EXCLUDED.purchase_count,
    updated_at = now();

  -- Receipts
  INSERT INTO public.monthly_summary(tenant_id, year_month, collected)
  SELECT tenant_id, to_char(pay_date,'YYYY-MM'), SUM(COALESCE(amount,0))
  FROM public.customer_receipts
  WHERE tenant_id IS NOT NULL
    AND (p_tenant IS NULL OR tenant_id = p_tenant)
  GROUP BY 1,2
  ON CONFLICT (tenant_id, year_month) DO UPDATE SET
    collected = EXCLUDED.collected,
    updated_at = now();

  -- Payments
  INSERT INTO public.monthly_summary(tenant_id, year_month, paid)
  SELECT tenant_id, to_char(pay_date,'YYYY-MM'), SUM(COALESCE(amount,0))
  FROM public.supplier_payments
  WHERE tenant_id IS NOT NULL
    AND (p_tenant IS NULL OR tenant_id = p_tenant)
  GROUP BY 1,2
  ON CONFLICT (tenant_id, year_month) DO UPDATE SET
    paid = EXCLUDED.paid,
    updated_at = now();
END $$;

-- Run backfill once for existing data
SELECT public.rebuild_account_period_balances(NULL);
SELECT public.rebuild_monthly_summary(NULL);
