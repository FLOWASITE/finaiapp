
DO $$ BEGIN
  ALTER TABLE public.customer_receipts
    ADD CONSTRAINT customer_receipts_invoice_fk
    FOREIGN KEY (invoice_id) REFERENCES public.sales_invoices(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.sales_invoices
    ADD CONSTRAINT sales_invoices_customer_fk
    FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.sales_invoice_lines
    ADD CONSTRAINT sales_invoice_lines_invoice_fk
    FOREIGN KEY (invoice_id) REFERENCES public.sales_invoices(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.sales_invoice_lines
    ADD CONSTRAINT sales_invoice_lines_product_fk
    FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.stock_take_lines
    ADD CONSTRAINT stock_take_lines_product_fk
    FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
