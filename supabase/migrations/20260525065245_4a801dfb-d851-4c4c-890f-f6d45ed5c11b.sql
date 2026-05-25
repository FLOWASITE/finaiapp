
-- Drop permissive "own X all" policies on tenant-scoped tables that already have tenant-based CRUD policies.
DROP POLICY IF EXISTS "own ai_suggestions all" ON public.ai_suggestions;
DROP POLICY IF EXISTS "own bank_accounts all" ON public.bank_accounts;
DROP POLICY IF EXISTS "own bank_transactions all" ON public.bank_transactions;
DROP POLICY IF EXISTS "own bank_vouchers all" ON public.bank_vouchers;
DROP POLICY IF EXISTS "own branches all" ON public.branches;
DROP POLICY IF EXISTS "own cash_vouchers all" ON public.cash_vouchers;
DROP POLICY IF EXISTS "own cost_centers all" ON public.cost_centers;
DROP POLICY IF EXISTS "own customer_groups all" ON public.customer_groups;
DROP POLICY IF EXISTS "own customer_receipts all" ON public.customer_receipts;
DROP POLICY IF EXISTS "own customers all" ON public.customers;
DROP POLICY IF EXISTS "own departments all" ON public.departments;
DROP POLICY IF EXISTS "own documents all" ON public.documents;
DROP POLICY IF EXISTS "own employees" ON public.employees;
DROP POLICY IF EXISTS "own fx" ON public.exchange_rates;
DROP POLICY IF EXISTS "own fiscal_periods all" ON public.fiscal_periods;
DROP POLICY IF EXISTS "own fiscal_years all" ON public.fiscal_years;
DROP POLICY IF EXISTS "own fixed_assets all" ON public.fixed_assets;
DROP POLICY IF EXISTS "own invoices all" ON public.invoices;
DROP POLICY IF EXISTS "own journal_entries all" ON public.journal_entries;
DROP POLICY IF EXISTS "own payroll_runs" ON public.payroll_runs;
DROP POLICY IF EXISTS "own product_categories all" ON public.product_categories;
DROP POLICY IF EXISTS "own puc all" ON public.product_unit_conversions;
DROP POLICY IF EXISTS "own product_units all" ON public.product_units;
DROP POLICY IF EXISTS "own products all" ON public.products;
DROP POLICY IF EXISTS "own projects all" ON public.projects;
DROP POLICY IF EXISTS "own report_notes all" ON public.report_notes;
DROP POLICY IF EXISTS "own report_snapshots all" ON public.report_snapshots;
DROP POLICY IF EXISTS "own sales_invoices all" ON public.sales_invoices;
DROP POLICY IF EXISTS "own stock_movements all" ON public.stock_movements;
DROP POLICY IF EXISTS "own stock_takes all" ON public.stock_takes;
DROP POLICY IF EXISTS "own stock_vouchers all" ON public.stock_vouchers;
DROP POLICY IF EXISTS "own supplier_groups all" ON public.supplier_groups;
DROP POLICY IF EXISTS "own supplier_payments" ON public.supplier_payments;
DROP POLICY IF EXISTS "own suppliers all" ON public.suppliers;
DROP POLICY IF EXISTS "own warehouses all" ON public.warehouses;

-- ai_actions: only had user_id policy. Replace with tenant-scoped policy.
DROP POLICY IF EXISTS "own ai_actions all" ON public.ai_actions;
CREATE POLICY "tenant ai_actions all" ON public.ai_actions
  FOR ALL TO authenticated
  USING (tenant_id IS NOT NULL AND public.is_tenant_member(auth.uid(), tenant_id))
  WITH CHECK (tenant_id IS NOT NULL AND public.is_tenant_member(auth.uid(), tenant_id));

-- sales_orders: had OR (user_id = auth.uid()) fallback that leaks; replace with tenant-only.
DROP POLICY IF EXISTS "so_select" ON public.sales_orders;
CREATE POLICY "so_select" ON public.sales_orders
  FOR SELECT TO authenticated
  USING (tenant_id IS NOT NULL AND public.is_tenant_member(auth.uid(), tenant_id));

-- sales_order_lines: rewrite to require tenant membership on parent order.
DROP POLICY IF EXISTS "sol_select" ON public.sales_order_lines;
CREATE POLICY "sol_select" ON public.sales_order_lines
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.sales_orders o
    WHERE o.id = sales_order_lines.order_id
      AND o.tenant_id IS NOT NULL
      AND public.is_tenant_member(auth.uid(), o.tenant_id)
  ));
