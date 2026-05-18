-- Revoke direct access to materialized views via PostgREST
REVOKE ALL ON public.mv_ar_aging FROM anon, authenticated;
REVOKE ALL ON public.mv_ap_aging FROM anon, authenticated;
REVOKE ALL ON public.mv_monthly_sales_by_customer FROM anon, authenticated;
REVOKE ALL ON public.mv_monthly_purchases_by_supplier FROM anon, authenticated;
REVOKE ALL ON public.mv_account_period_summary FROM anon, authenticated;

-- Tenant-scoped accessor functions (SECURITY DEFINER + search_path)
CREATE OR REPLACE FUNCTION public.get_ar_aging()
RETURNS SETOF public.mv_ar_aging
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT * FROM public.mv_ar_aging
  WHERE tenant_id = public.current_tenant_id();
$$;

CREATE OR REPLACE FUNCTION public.get_ap_aging()
RETURNS SETOF public.mv_ap_aging
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT * FROM public.mv_ap_aging
  WHERE tenant_id = public.current_tenant_id();
$$;

CREATE OR REPLACE FUNCTION public.get_monthly_sales_by_customer(
  p_year_month_from text DEFAULT NULL,
  p_year_month_to   text DEFAULT NULL
)
RETURNS SETOF public.mv_monthly_sales_by_customer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT * FROM public.mv_monthly_sales_by_customer
  WHERE tenant_id = public.current_tenant_id()
    AND (p_year_month_from IS NULL OR year_month >= p_year_month_from)
    AND (p_year_month_to   IS NULL OR year_month <= p_year_month_to);
$$;

CREATE OR REPLACE FUNCTION public.get_monthly_purchases_by_supplier(
  p_year_month_from text DEFAULT NULL,
  p_year_month_to   text DEFAULT NULL
)
RETURNS SETOF public.mv_monthly_purchases_by_supplier
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT * FROM public.mv_monthly_purchases_by_supplier
  WHERE tenant_id = public.current_tenant_id()
    AND (p_year_month_from IS NULL OR year_month >= p_year_month_from)
    AND (p_year_month_to   IS NULL OR year_month <= p_year_month_to);
$$;

CREATE OR REPLACE FUNCTION public.get_account_period_summary(p_year int DEFAULT NULL)
RETURNS SETOF public.mv_account_period_summary
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT * FROM public.mv_account_period_summary
  WHERE tenant_id = public.current_tenant_id()
    AND (p_year IS NULL OR year = p_year);
$$;

-- Limit execute to authenticated users only
REVOKE ALL ON FUNCTION public.get_ar_aging() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_ap_aging() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_monthly_sales_by_customer(text,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_monthly_purchases_by_supplier(text,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_account_period_summary(int) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_ar_aging() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_ap_aging() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_monthly_sales_by_customer(text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_monthly_purchases_by_supplier(text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_account_period_summary(int) TO authenticated;
