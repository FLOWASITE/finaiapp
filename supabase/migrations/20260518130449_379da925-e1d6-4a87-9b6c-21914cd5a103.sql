CREATE EXTENSION IF NOT EXISTS pg_cron;

-- =========================================================
-- 1. AR Aging
-- =========================================================
CREATE MATERIALIZED VIEW IF NOT EXISTS public.mv_ar_aging AS
SELECT
  si.tenant_id,
  si.customer_id,
  COUNT(*)::int AS open_invoices,
  COALESCE(SUM(GREATEST(COALESCE(si.total,0) - COALESCE(si.paid_amount,0), 0)), 0) AS total_outstanding,
  COALESCE(SUM(CASE WHEN si.due_date IS NULL OR si.due_date >= CURRENT_DATE
    THEN GREATEST(COALESCE(si.total,0) - COALESCE(si.paid_amount,0), 0) ELSE 0 END), 0) AS bucket_current,
  COALESCE(SUM(CASE WHEN si.due_date < CURRENT_DATE AND si.due_date >= CURRENT_DATE - 30
    THEN GREATEST(COALESCE(si.total,0) - COALESCE(si.paid_amount,0), 0) ELSE 0 END), 0) AS bucket_1_30,
  COALESCE(SUM(CASE WHEN si.due_date < CURRENT_DATE - 30 AND si.due_date >= CURRENT_DATE - 60
    THEN GREATEST(COALESCE(si.total,0) - COALESCE(si.paid_amount,0), 0) ELSE 0 END), 0) AS bucket_31_60,
  COALESCE(SUM(CASE WHEN si.due_date < CURRENT_DATE - 60 AND si.due_date >= CURRENT_DATE - 90
    THEN GREATEST(COALESCE(si.total,0) - COALESCE(si.paid_amount,0), 0) ELSE 0 END), 0) AS bucket_61_90,
  COALESCE(SUM(CASE WHEN si.due_date < CURRENT_DATE - 90
    THEN GREATEST(COALESCE(si.total,0) - COALESCE(si.paid_amount,0), 0) ELSE 0 END), 0) AS bucket_over_90,
  now() AS refreshed_at
FROM public.sales_invoices si
WHERE si.tenant_id IS NOT NULL
  AND si.status IS DISTINCT FROM 'void'
  AND si.payment_status IS DISTINCT FROM 'paid'
  AND si.customer_id IS NOT NULL
GROUP BY si.tenant_id, si.customer_id;

CREATE UNIQUE INDEX IF NOT EXISTS mv_ar_aging_pk
  ON public.mv_ar_aging (tenant_id, customer_id);
CREATE INDEX IF NOT EXISTS mv_ar_aging_tenant ON public.mv_ar_aging (tenant_id);

-- =========================================================
-- 2. AP Aging (no due_date on invoices → age by issue_date)
-- =========================================================
CREATE MATERIALIZED VIEW IF NOT EXISTS public.mv_ap_aging AS
WITH paid AS (
  SELECT invoice_id, SUM(amount) AS paid_amount
  FROM public.supplier_payments
  GROUP BY invoice_id
)
SELECT
  i.tenant_id,
  i.supplier_id,
  COUNT(*)::int AS open_invoices,
  COALESCE(SUM(GREATEST(COALESCE(i.total,0) - COALESCE(p.paid_amount,0), 0)), 0) AS total_outstanding,
  COALESCE(SUM(CASE WHEN i.issue_date IS NULL OR i.issue_date >= CURRENT_DATE - 30
    THEN GREATEST(COALESCE(i.total,0) - COALESCE(p.paid_amount,0), 0) ELSE 0 END), 0) AS bucket_current,
  COALESCE(SUM(CASE WHEN i.issue_date < CURRENT_DATE - 30 AND i.issue_date >= CURRENT_DATE - 60
    THEN GREATEST(COALESCE(i.total,0) - COALESCE(p.paid_amount,0), 0) ELSE 0 END), 0) AS bucket_1_30,
  COALESCE(SUM(CASE WHEN i.issue_date < CURRENT_DATE - 60 AND i.issue_date >= CURRENT_DATE - 90
    THEN GREATEST(COALESCE(i.total,0) - COALESCE(p.paid_amount,0), 0) ELSE 0 END), 0) AS bucket_31_60,
  COALESCE(SUM(CASE WHEN i.issue_date < CURRENT_DATE - 90 AND i.issue_date >= CURRENT_DATE - 120
    THEN GREATEST(COALESCE(i.total,0) - COALESCE(p.paid_amount,0), 0) ELSE 0 END), 0) AS bucket_61_90,
  COALESCE(SUM(CASE WHEN i.issue_date < CURRENT_DATE - 120
    THEN GREATEST(COALESCE(i.total,0) - COALESCE(p.paid_amount,0), 0) ELSE 0 END), 0) AS bucket_over_90,
  now() AS refreshed_at
FROM public.invoices i
LEFT JOIN paid p ON p.invoice_id = i.id
WHERE i.tenant_id IS NOT NULL
  AND i.status IS DISTINCT FROM 'void'
  AND i.payment_status IS DISTINCT FROM 'paid'
  AND i.supplier_id IS NOT NULL
GROUP BY i.tenant_id, i.supplier_id;

CREATE UNIQUE INDEX IF NOT EXISTS mv_ap_aging_pk
  ON public.mv_ap_aging (tenant_id, supplier_id);
CREATE INDEX IF NOT EXISTS mv_ap_aging_tenant ON public.mv_ap_aging (tenant_id);

-- =========================================================
-- 3. Monthly sales by customer
-- =========================================================
CREATE MATERIALIZED VIEW IF NOT EXISTS public.mv_monthly_sales_by_customer AS
SELECT
  si.tenant_id,
  to_char(si.issue_date, 'YYYY-MM') AS year_month,
  si.customer_id,
  COUNT(*)::int AS invoice_count,
  COALESCE(SUM(si.total), 0) AS revenue,
  COALESCE(SUM(si.paid_amount), 0) AS collected,
  now() AS refreshed_at
FROM public.sales_invoices si
WHERE si.tenant_id IS NOT NULL
  AND si.issue_date IS NOT NULL
  AND si.customer_id IS NOT NULL
  AND si.status IS DISTINCT FROM 'void'
GROUP BY si.tenant_id, to_char(si.issue_date, 'YYYY-MM'), si.customer_id;

CREATE UNIQUE INDEX IF NOT EXISTS mv_monthly_sales_by_customer_pk
  ON public.mv_monthly_sales_by_customer (tenant_id, year_month, customer_id);
CREATE INDEX IF NOT EXISTS mv_monthly_sales_by_customer_tenant_ym
  ON public.mv_monthly_sales_by_customer (tenant_id, year_month);

-- =========================================================
-- 4. Monthly purchases by supplier
-- =========================================================
CREATE MATERIALIZED VIEW IF NOT EXISTS public.mv_monthly_purchases_by_supplier AS
SELECT
  i.tenant_id,
  to_char(i.issue_date, 'YYYY-MM') AS year_month,
  i.supplier_id,
  COUNT(*)::int AS invoice_count,
  COALESCE(SUM(i.total), 0) AS expense,
  now() AS refreshed_at
FROM public.invoices i
WHERE i.tenant_id IS NOT NULL
  AND i.issue_date IS NOT NULL
  AND i.supplier_id IS NOT NULL
  AND i.status IS DISTINCT FROM 'void'
GROUP BY i.tenant_id, to_char(i.issue_date, 'YYYY-MM'), i.supplier_id;

CREATE UNIQUE INDEX IF NOT EXISTS mv_monthly_purchases_by_supplier_pk
  ON public.mv_monthly_purchases_by_supplier (tenant_id, year_month, supplier_id);
CREATE INDEX IF NOT EXISTS mv_monthly_purchases_by_supplier_tenant_ym
  ON public.mv_monthly_purchases_by_supplier (tenant_id, year_month);

-- =========================================================
-- 5. Account period summary with YTD running balance
-- =========================================================
CREATE MATERIALIZED VIEW IF NOT EXISTS public.mv_account_period_summary AS
SELECT
  apb.tenant_id,
  apb.account_code,
  apb.year,
  apb.period_no,
  apb.debit AS period_debit,
  apb.credit AS period_credit,
  SUM(apb.debit) OVER (
    PARTITION BY apb.tenant_id, apb.account_code, apb.year
    ORDER BY apb.period_no
    ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
  ) AS ytd_debit,
  SUM(apb.credit) OVER (
    PARTITION BY apb.tenant_id, apb.account_code, apb.year
    ORDER BY apb.period_no
    ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
  ) AS ytd_credit,
  now() AS refreshed_at
FROM public.account_period_balances apb;

CREATE UNIQUE INDEX IF NOT EXISTS mv_account_period_summary_pk
  ON public.mv_account_period_summary (tenant_id, account_code, year, period_no);
CREATE INDEX IF NOT EXISTS mv_account_period_summary_tenant_year
  ON public.mv_account_period_summary (tenant_id, year);

-- =========================================================
-- 6. Refresh function
-- =========================================================
CREATE OR REPLACE FUNCTION public.refresh_report_mvs(p_tenant uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_ar_aging;
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_ap_aging;
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_monthly_sales_by_customer;
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_monthly_purchases_by_supplier;
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_account_period_summary;
END $$;

GRANT SELECT ON public.mv_ar_aging TO authenticated;
GRANT SELECT ON public.mv_ap_aging TO authenticated;
GRANT SELECT ON public.mv_monthly_sales_by_customer TO authenticated;
GRANT SELECT ON public.mv_monthly_purchases_by_supplier TO authenticated;
GRANT SELECT ON public.mv_account_period_summary TO authenticated;

-- =========================================================
-- 7. pg_cron schedules (idempotent)
-- =========================================================
DO $$
DECLARE j record;
BEGIN
  FOR j IN SELECT jobname FROM cron.job
           WHERE jobname IN ('refresh-report-mvs-30min','rebuild-aggregations-daily')
  LOOP
    PERFORM cron.unschedule(j.jobname);
  END LOOP;
END $$;

SELECT cron.schedule(
  'refresh-report-mvs-30min',
  '*/30 * * * *',
  $$ SELECT public.refresh_report_mvs(); $$
);

SELECT cron.schedule(
  'rebuild-aggregations-daily',
  '0 1 * * *',
  $$
    SELECT public.rebuild_account_period_balances();
    SELECT public.rebuild_monthly_summary();
    SELECT public.refresh_report_mvs();
  $$
);

-- Prime the MVs once (non-concurrent first refresh on fresh MVs)
REFRESH MATERIALIZED VIEW public.mv_ar_aging;
REFRESH MATERIALIZED VIEW public.mv_ap_aging;
REFRESH MATERIALIZED VIEW public.mv_monthly_sales_by_customer;
REFRESH MATERIALIZED VIEW public.mv_monthly_purchases_by_supplier;
REFRESH MATERIALIZED VIEW public.mv_account_period_summary;
