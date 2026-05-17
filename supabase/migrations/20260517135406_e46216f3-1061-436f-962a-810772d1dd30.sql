
-- B3: Add tenant_id column + backfill + index for all business tables

DO $$
DECLARE
  tbl text;
  tables text[] := ARRAY[
    'invoices','sales_invoices','journal_entries','bank_accounts','bank_transactions',
    'cash_vouchers','customers','suppliers','supplier_payments','products','stock_movements',
    'fixed_assets','employees','payroll_runs','exchange_rates','period_locks',
    'report_snapshots','report_notes','ai_suggestions','audit_logs'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS tenant_id uuid', tbl);
    EXECUTE format(
      'UPDATE public.%I t SET tenant_id = p.active_tenant_id
         FROM public.profiles p
        WHERE t.user_id = p.id AND t.tenant_id IS NULL AND p.active_tenant_id IS NOT NULL',
      tbl
    );
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (tenant_id)',
                   'idx_' || tbl || '_tenant_id', tbl);
  END LOOP;
END $$;
