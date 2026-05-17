
-- B4: Add tenant-based RLS policies alongside existing user_id ones.
-- Multiple permissive policies are OR-combined → safe to layer.

-- Helper: write roles
-- owner|admin|accountant can write; viewer read-only.

DO $$
DECLARE
  tbl text;
  tables text[] := ARRAY[
    'invoices','sales_invoices','journal_entries','bank_accounts','bank_transactions',
    'cash_vouchers','customers','suppliers','supplier_payments','products','stock_movements',
    'fixed_assets','employees','payroll_runs','exchange_rates',
    'report_snapshots','report_notes','ai_suggestions'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    EXECUTE format($f$
      CREATE POLICY "tenant %1$s select" ON public.%1$I
        FOR SELECT
        USING (tenant_id IS NOT NULL AND public.is_tenant_member(auth.uid(), tenant_id))
    $f$, tbl);

    EXECUTE format($f$
      CREATE POLICY "tenant %1$s insert" ON public.%1$I
        FOR INSERT
        WITH CHECK (
          tenant_id IS NOT NULL
          AND tenant_id = public.current_tenant_id()
          AND public.has_tenant_role(auth.uid(), tenant_id,
              ARRAY['owner','admin','accountant'])
        )
    $f$, tbl);

    EXECUTE format($f$
      CREATE POLICY "tenant %1$s update" ON public.%1$I
        FOR UPDATE
        USING (tenant_id IS NOT NULL
               AND public.has_tenant_role(auth.uid(), tenant_id,
                   ARRAY['owner','admin','accountant']))
        WITH CHECK (tenant_id IS NOT NULL
               AND public.has_tenant_role(auth.uid(), tenant_id,
                   ARRAY['owner','admin','accountant']))
    $f$, tbl);

    EXECUTE format($f$
      CREATE POLICY "tenant %1$s delete" ON public.%1$I
        FOR DELETE
        USING (tenant_id IS NOT NULL
               AND public.has_tenant_role(auth.uid(), tenant_id,
                   ARRAY['owner','admin','accountant']))
    $f$, tbl);
  END LOOP;
END $$;

-- audit_logs: read-only for tenant members + superadmin
CREATE POLICY "tenant audit_logs select" ON public.audit_logs
  FOR SELECT
  USING (tenant_id IS NOT NULL AND public.is_tenant_member(auth.uid(), tenant_id));

-- period_locks: only owner|admin of tenant can manage
CREATE POLICY "tenant period_locks select" ON public.period_locks
  FOR SELECT
  USING (tenant_id IS NOT NULL AND public.is_tenant_member(auth.uid(), tenant_id));

CREATE POLICY "tenant period_locks write" ON public.period_locks
  FOR ALL
  USING (tenant_id IS NOT NULL
         AND public.has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin']))
  WITH CHECK (tenant_id IS NOT NULL
         AND tenant_id = public.current_tenant_id()
         AND public.has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin']));
