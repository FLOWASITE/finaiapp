
-- =========================================
-- SALES ORDERS HEADER
-- =========================================
CREATE TABLE public.sales_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  tenant_id uuid,

  order_no text NOT NULL,
  order_date date NOT NULL DEFAULT CURRENT_DATE,
  expected_delivery_date date,
  valid_until date,

  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  customer_name text,
  customer_tax_id text,
  ship_address text,
  billing_address text,

  currency text NOT NULL DEFAULT 'VND',
  fx_rate numeric NOT NULL DEFAULT 1,

  subtotal numeric NOT NULL DEFAULT 0,
  discount_amount numeric NOT NULL DEFAULT 0,
  vat_amount numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,

  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','confirmed','partial','fulfilled','closed','cancelled')),
  payment_terms_days int,
  notes text,
  internal_notes text,

  branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  cost_center_id uuid REFERENCES public.cost_centers(id) ON DELETE SET NULL,
  salesperson_id uuid,

  confirmed_at timestamptz,
  confirmed_by uuid,
  closed_at timestamptz,
  cancel_reason text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX sales_orders_no_per_tenant_uidx
  ON public.sales_orders (COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), order_no);
CREATE INDEX sales_orders_customer_idx ON public.sales_orders(customer_id);
CREATE INDEX sales_orders_date_idx ON public.sales_orders(order_date DESC);
CREATE INDEX sales_orders_status_idx ON public.sales_orders(status);
CREATE INDEX sales_orders_tenant_idx ON public.sales_orders(tenant_id);

CREATE TRIGGER sales_orders_updated_at
  BEFORE UPDATE ON public.sales_orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.sales_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "so_select" ON public.sales_orders FOR SELECT
USING (
  (tenant_id IS NOT NULL AND public.is_tenant_member(auth.uid(), tenant_id))
  OR (tenant_id IS NULL AND user_id = auth.uid())
);
CREATE POLICY "so_insert" ON public.sales_orders FOR INSERT
WITH CHECK (
  user_id = auth.uid() AND (
    tenant_id IS NULL OR public.is_tenant_member(auth.uid(), tenant_id)
  )
);
CREATE POLICY "so_update" ON public.sales_orders FOR UPDATE
USING (
  (tenant_id IS NOT NULL AND public.is_tenant_member(auth.uid(), tenant_id))
  OR (tenant_id IS NULL AND user_id = auth.uid())
);
CREATE POLICY "so_delete" ON public.sales_orders FOR DELETE
USING (
  (tenant_id IS NOT NULL AND public.is_tenant_member(auth.uid(), tenant_id))
  OR (tenant_id IS NULL AND user_id = auth.uid())
);

-- =========================================
-- SALES ORDER LINES
-- =========================================
CREATE TABLE public.sales_order_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.sales_orders(id) ON DELETE CASCADE,
  line_no int NOT NULL DEFAULT 1,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  description text NOT NULL,
  unit text,
  qty_ordered numeric NOT NULL DEFAULT 0,
  qty_delivered numeric NOT NULL DEFAULT 0,
  unit_price numeric NOT NULL DEFAULT 0,
  discount_percent numeric NOT NULL DEFAULT 0,
  discount_amount numeric NOT NULL DEFAULT 0,
  vat_rate numeric NOT NULL DEFAULT 0,
  vat_amount numeric NOT NULL DEFAULT 0,
  pre_vat_amount numeric NOT NULL DEFAULT 0,
  amount numeric NOT NULL DEFAULT 0,
  warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE SET NULL,
  notes text
);

CREATE INDEX sol_order_idx ON public.sales_order_lines(order_id);
CREATE INDEX sol_product_idx ON public.sales_order_lines(product_id);

ALTER TABLE public.sales_order_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sol_select" ON public.sales_order_lines FOR SELECT
USING (EXISTS (SELECT 1 FROM public.sales_orders o WHERE o.id = order_id
  AND ((o.tenant_id IS NOT NULL AND public.is_tenant_member(auth.uid(), o.tenant_id))
       OR (o.tenant_id IS NULL AND o.user_id = auth.uid()))));
CREATE POLICY "sol_insert" ON public.sales_order_lines FOR INSERT
WITH CHECK (EXISTS (SELECT 1 FROM public.sales_orders o WHERE o.id = order_id
  AND ((o.tenant_id IS NOT NULL AND public.is_tenant_member(auth.uid(), o.tenant_id))
       OR (o.tenant_id IS NULL AND o.user_id = auth.uid()))));
CREATE POLICY "sol_update" ON public.sales_order_lines FOR UPDATE
USING (EXISTS (SELECT 1 FROM public.sales_orders o WHERE o.id = order_id
  AND ((o.tenant_id IS NOT NULL AND public.is_tenant_member(auth.uid(), o.tenant_id))
       OR (o.tenant_id IS NULL AND o.user_id = auth.uid()))));
CREATE POLICY "sol_delete" ON public.sales_order_lines FOR DELETE
USING (EXISTS (SELECT 1 FROM public.sales_orders o WHERE o.id = order_id
  AND ((o.tenant_id IS NOT NULL AND public.is_tenant_member(auth.uid(), o.tenant_id))
       OR (o.tenant_id IS NULL AND o.user_id = auth.uid()))));

-- =========================================
-- LINK sales_invoice_lines → sales_order_lines
-- =========================================
ALTER TABLE public.sales_invoice_lines
  ADD COLUMN IF NOT EXISTS sales_order_line_id uuid
    REFERENCES public.sales_order_lines(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS sil_so_line_idx
  ON public.sales_invoice_lines(sales_order_line_id);

-- =========================================
-- TRIGGER: cập nhật qty_delivered và status SO
-- =========================================
CREATE OR REPLACE FUNCTION public.refresh_sales_order_progress(p_line_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id uuid;
  v_total numeric;
  v_qord numeric;
  v_qdel numeric;
  v_status text;
  v_remaining numeric;
BEGIN
  IF p_line_id IS NULL THEN RETURN; END IF;

  SELECT order_id INTO v_order_id FROM public.sales_order_lines WHERE id = p_line_id;
  IF v_order_id IS NULL THEN RETURN; END IF;

  -- Tổng qty đã giao = SUM qty từ sales_invoice_lines liên kết, loại trừ HĐ void
  SELECT COALESCE(SUM(sil.qty), 0)
    INTO v_total
  FROM public.sales_invoice_lines sil
  JOIN public.sales_invoices si ON si.id = sil.invoice_id
  WHERE sil.sales_order_line_id = p_line_id
    AND COALESCE(si.status, '') <> 'void';

  UPDATE public.sales_order_lines SET qty_delivered = v_total WHERE id = p_line_id;

  -- Cập nhật trạng thái header
  SELECT
    COALESCE(SUM(qty_ordered), 0),
    COALESCE(SUM(qty_delivered), 0)
  INTO v_qord, v_qdel
  FROM public.sales_order_lines
  WHERE order_id = v_order_id;

  SELECT status INTO v_status FROM public.sales_orders WHERE id = v_order_id;
  IF v_status IN ('cancelled','closed','draft') THEN RETURN; END IF;

  v_remaining := v_qord - v_qdel;
  IF v_qdel <= 0 THEN
    UPDATE public.sales_orders SET status = 'confirmed' WHERE id = v_order_id AND status IN ('partial','fulfilled');
  ELSIF v_remaining <= 0.0001 THEN
    UPDATE public.sales_orders SET status = 'fulfilled' WHERE id = v_order_id;
  ELSE
    UPDATE public.sales_orders SET status = 'partial' WHERE id = v_order_id;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.tg_sil_refresh_so_progress()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.refresh_sales_order_progress(NEW.sales_order_line_id);
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.sales_order_line_id IS DISTINCT FROM NEW.sales_order_line_id THEN
      PERFORM public.refresh_sales_order_progress(OLD.sales_order_line_id);
      PERFORM public.refresh_sales_order_progress(NEW.sales_order_line_id);
    ELSIF OLD.qty IS DISTINCT FROM NEW.qty THEN
      PERFORM public.refresh_sales_order_progress(NEW.sales_order_line_id);
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.refresh_sales_order_progress(OLD.sales_order_line_id);
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS sil_refresh_so_progress ON public.sales_invoice_lines;
CREATE TRIGGER sil_refresh_so_progress
AFTER INSERT OR UPDATE OR DELETE ON public.sales_invoice_lines
FOR EACH ROW EXECUTE FUNCTION public.tg_sil_refresh_so_progress();

-- Khi sales_invoices đổi status (void/back), refresh tất cả SO line liên quan
CREATE OR REPLACE FUNCTION public.tg_si_refresh_so_progress()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE r record;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    FOR r IN SELECT DISTINCT sales_order_line_id FROM public.sales_invoice_lines
             WHERE invoice_id = NEW.id AND sales_order_line_id IS NOT NULL LOOP
      PERFORM public.refresh_sales_order_progress(r.sales_order_line_id);
    END LOOP;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS si_refresh_so_progress ON public.sales_invoices;
CREATE TRIGGER si_refresh_so_progress
AFTER UPDATE ON public.sales_invoices
FOR EACH ROW EXECUTE FUNCTION public.tg_si_refresh_so_progress();
