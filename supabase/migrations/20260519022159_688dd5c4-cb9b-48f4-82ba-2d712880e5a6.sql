
ALTER TABLE public.sales_invoices ADD CONSTRAINT sales_invoices_journal_entry_id_fkey FOREIGN KEY (journal_entry_id) REFERENCES public.journal_entries(id) ON DELETE SET NULL;
ALTER TABLE public.sales_invoices ADD CONSTRAINT sales_invoices_sales_order_id_fkey FOREIGN KEY (sales_order_id) REFERENCES public.sales_orders(id) ON DELETE SET NULL;

ALTER TABLE public.sales_order_deposits ADD CONSTRAINT sales_order_deposits_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE SET NULL;
ALTER TABLE public.sales_order_deposits ADD CONSTRAINT sales_order_deposits_cost_center_id_fkey FOREIGN KEY (cost_center_id) REFERENCES public.cost_centers(id) ON DELETE SET NULL;
ALTER TABLE public.sales_order_deposits ADD CONSTRAINT sales_order_deposits_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(id) ON DELETE SET NULL;
ALTER TABLE public.sales_order_deposits ADD CONSTRAINT sales_order_deposits_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE SET NULL;

ALTER TABLE public.sales_orders ADD CONSTRAINT sales_orders_salesperson_id_fkey FOREIGN KEY (salesperson_id) REFERENCES public.employees(id) ON DELETE SET NULL;

ALTER TABLE public.stock_takes ADD CONSTRAINT stock_takes_journal_entry_id_fkey FOREIGN KEY (journal_entry_id) REFERENCES public.journal_entries(id) ON DELETE SET NULL;
ALTER TABLE public.stock_vouchers ADD CONSTRAINT stock_vouchers_journal_entry_id_fkey FOREIGN KEY (journal_entry_id) REFERENCES public.journal_entries(id) ON DELETE SET NULL;
ALTER TABLE public.supplier_payments ADD CONSTRAINT supplier_payments_journal_entry_id_fkey FOREIGN KEY (journal_entry_id) REFERENCES public.journal_entries(id) ON DELETE SET NULL;

ALTER TABLE public.product_unit_conversions ADD CONSTRAINT product_unit_conversions_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;
ALTER TABLE public.supplier_payments ADD CONSTRAINT supplier_payments_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE CASCADE;
ALTER TABLE public.supplier_payments ADD CONSTRAINT supplier_payments_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE RESTRICT;
