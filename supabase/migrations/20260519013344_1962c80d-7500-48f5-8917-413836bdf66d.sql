
-- =====================================================================
-- 1) Mở rộng sales_orders với cờ và trường deposit
-- =====================================================================
ALTER TABLE public.sales_orders
  ADD COLUMN IF NOT EXISTS deposit_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reserve_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deposit_required numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS deposit_percent numeric,
  ADD COLUMN IF NOT EXISTS deposit_due_date date,
  ADD COLUMN IF NOT EXISTS deposit_received numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS deposit_status text NOT NULL DEFAULT 'none';

-- =====================================================================
-- 2) sales_order_deposits — phiếu thu cọc của SO
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.sales_order_deposits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  tenant_id uuid,
  order_id uuid NOT NULL REFERENCES public.sales_orders(id) ON DELETE CASCADE,
  deposit_no text NOT NULL,
  pay_date date NOT NULL DEFAULT CURRENT_DATE,
  amount numeric NOT NULL CHECK (amount > 0),
  method text NOT NULL DEFAULT 'cash', -- cash | bank
  reference text,
  cash_account text,                   -- 111x / 112x
  advance_account text NOT NULL DEFAULT '131', -- TK theo dõi cọc (131 / 3387)
  status text NOT NULL DEFAULT 'uploaded', -- uploaded | posted | void
  journal_entry_id uuid REFERENCES public.journal_entries(id) ON DELETE SET NULL,
  applied_to_invoice_id uuid REFERENCES public.sales_invoices(id) ON DELETE SET NULL,
  notes text,
  posted_at timestamptz,
  voided_at timestamptz,
  void_reason text,
  branch_id uuid,
  department_id uuid,
  project_id uuid,
  cost_center_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sod_order_idx ON public.sales_order_deposits(order_id);
CREATE INDEX IF NOT EXISTS sod_tenant_date_idx ON public.sales_order_deposits(tenant_id, pay_date DESC);
CREATE UNIQUE INDEX IF NOT EXISTS sod_no_uniq ON public.sales_order_deposits(tenant_id, deposit_no);

ALTER TABLE public.sales_order_deposits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sod_select" ON public.sales_order_deposits
  FOR SELECT TO authenticated
  USING (tenant_id IS NOT NULL AND public.is_tenant_member(auth.uid(), tenant_id));

CREATE POLICY "sod_insert" ON public.sales_order_deposits
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id IS NOT NULL
    AND public.has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin','accountant','sales'])
    AND user_id = auth.uid()
  );

CREATE POLICY "sod_update" ON public.sales_order_deposits
  FOR UPDATE TO authenticated
  USING (tenant_id IS NOT NULL AND public.has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin','accountant','sales']));

CREATE POLICY "sod_delete" ON public.sales_order_deposits
  FOR DELETE TO authenticated
  USING (tenant_id IS NOT NULL AND public.has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin']));

CREATE TRIGGER trg_sod_updated_at BEFORE UPDATE ON public.sales_order_deposits
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =====================================================================
-- 3) stock_reservations — giữ tồn logic
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.stock_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE SET NULL,
  ref_type text NOT NULL DEFAULT 'sales_order',
  ref_id uuid NOT NULL, -- = sales_order_lines.id
  qty_reserved numeric NOT NULL CHECK (qty_reserved >= 0),
  qty_released numeric NOT NULL DEFAULT 0 CHECK (qty_released >= 0),
  status text NOT NULL DEFAULT 'active', -- active | released | cancelled
  reserved_at timestamptz NOT NULL DEFAULT now(),
  released_at timestamptz,
  expires_at date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS sres_ref_uniq ON public.stock_reservations(ref_type, ref_id);
CREATE INDEX IF NOT EXISTS sres_product_wh_idx ON public.stock_reservations(product_id, warehouse_id, status);
CREATE INDEX IF NOT EXISTS sres_tenant_idx ON public.stock_reservations(tenant_id, status);

ALTER TABLE public.stock_reservations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sres_select" ON public.stock_reservations
  FOR SELECT TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id));

CREATE POLICY "sres_insert" ON public.stock_reservations
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin','accountant','sales','warehouse'])
    AND user_id = auth.uid()
  );

CREATE POLICY "sres_update" ON public.stock_reservations
  FOR UPDATE TO authenticated
  USING (public.has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin','accountant','sales','warehouse']));

CREATE POLICY "sres_delete" ON public.stock_reservations
  FOR DELETE TO authenticated
  USING (public.has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin']));

CREATE TRIGGER trg_sres_updated_at BEFORE UPDATE ON public.stock_reservations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =====================================================================
-- 4) Helper: tồn khả dụng = on_hand - reserved_open
-- =====================================================================
CREATE OR REPLACE FUNCTION public.fn_product_reserved_qty(
  p_product uuid, p_warehouse uuid
) RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(SUM(qty_reserved - qty_released), 0)
  FROM public.stock_reservations
  WHERE product_id = p_product
    AND status = 'active'
    AND (p_warehouse IS NULL OR warehouse_id = p_warehouse OR warehouse_id IS NULL);
$$;

CREATE OR REPLACE FUNCTION public.fn_product_on_hand(
  p_product uuid, p_warehouse uuid
) RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(SUM(qty), 0)
  FROM public.stock_movements
  WHERE product_id = p_product
    AND (p_warehouse IS NULL OR warehouse_id = p_warehouse);
$$;

CREATE OR REPLACE FUNCTION public.fn_product_available_qty(
  p_product uuid, p_warehouse uuid
) RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.fn_product_on_hand(p_product, p_warehouse)
       - public.fn_product_reserved_qty(p_product, p_warehouse);
$$;

-- =====================================================================
-- 5) Trigger: cập nhật deposit_received & deposit_status trên SO
-- =====================================================================
CREATE OR REPLACE FUNCTION public.tg_so_deposits_refresh()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_order uuid;
  v_recv numeric;
  v_req numeric;
  v_status text;
BEGIN
  v_order := COALESCE(NEW.order_id, OLD.order_id);
  IF v_order IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_recv
  FROM public.sales_order_deposits
  WHERE order_id = v_order AND status <> 'void';

  SELECT COALESCE(deposit_required, 0) INTO v_req
  FROM public.sales_orders WHERE id = v_order;

  v_status := CASE
    WHEN v_req <= 0 AND v_recv <= 0 THEN 'none'
    WHEN v_recv <= 0 THEN 'pending'
    WHEN v_recv + 0.01 < v_req THEN 'partial'
    ELSE 'received'
  END;

  UPDATE public.sales_orders
  SET deposit_received = v_recv, deposit_status = v_status, updated_at = now()
  WHERE id = v_order;

  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS trg_sod_refresh_so ON public.sales_order_deposits;
CREATE TRIGGER trg_sod_refresh_so
AFTER INSERT OR UPDATE OR DELETE ON public.sales_order_deposits
FOR EACH ROW EXECUTE FUNCTION public.tg_so_deposits_refresh();

-- =====================================================================
-- 6) Trigger: tự giải phóng reservation khi hoá đơn được tạo/sửa từ SO
-- =====================================================================
CREATE OR REPLACE FUNCTION public.fn_release_reservation_for_so_line(p_line_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_delivered numeric;
  v_qty_reserved numeric;
  v_res_id uuid;
  v_status text;
BEGIN
  IF p_line_id IS NULL THEN RETURN; END IF;

  -- Tổng đã giao (loại HĐ void) cho line này
  SELECT COALESCE(SUM(sil.qty), 0) INTO v_delivered
  FROM public.sales_invoice_lines sil
  JOIN public.sales_invoices si ON si.id = sil.invoice_id
  WHERE sil.sales_order_line_id = p_line_id
    AND COALESCE(si.status, '') <> 'void';

  SELECT id, qty_reserved, status INTO v_res_id, v_qty_reserved, v_status
  FROM public.stock_reservations
  WHERE ref_type = 'sales_order' AND ref_id = p_line_id
  LIMIT 1;

  IF v_res_id IS NULL THEN RETURN; END IF;

  UPDATE public.stock_reservations
  SET qty_released = LEAST(qty_reserved, v_delivered),
      status = CASE
        WHEN status = 'cancelled' THEN 'cancelled'
        WHEN LEAST(qty_reserved, v_delivered) >= qty_reserved THEN 'released'
        ELSE 'active'
      END,
      released_at = CASE
        WHEN LEAST(qty_reserved, v_delivered) >= qty_reserved THEN now()
        ELSE released_at
      END,
      updated_at = now()
  WHERE id = v_res_id;
END $$;

CREATE OR REPLACE FUNCTION public.tg_sil_release_reservation()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.fn_release_reservation_for_so_line(NEW.sales_order_line_id);
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.sales_order_line_id IS DISTINCT FROM NEW.sales_order_line_id THEN
      PERFORM public.fn_release_reservation_for_so_line(OLD.sales_order_line_id);
      PERFORM public.fn_release_reservation_for_so_line(NEW.sales_order_line_id);
    ELSIF OLD.qty IS DISTINCT FROM NEW.qty THEN
      PERFORM public.fn_release_reservation_for_so_line(NEW.sales_order_line_id);
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.fn_release_reservation_for_so_line(OLD.sales_order_line_id);
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS trg_sil_release_res ON public.sales_invoice_lines;
CREATE TRIGGER trg_sil_release_res
AFTER INSERT OR UPDATE OR DELETE ON public.sales_invoice_lines
FOR EACH ROW EXECUTE FUNCTION public.tg_sil_release_reservation();

-- Khi HĐ chuyển void → refresh release cho mọi line
CREATE OR REPLACE FUNCTION public.tg_si_release_reservation_on_void()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    FOR r IN SELECT DISTINCT sales_order_line_id FROM public.sales_invoice_lines
             WHERE invoice_id = NEW.id AND sales_order_line_id IS NOT NULL LOOP
      PERFORM public.fn_release_reservation_for_so_line(r.sales_order_line_id);
    END LOOP;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_si_release_res_void ON public.sales_invoices;
CREATE TRIGGER trg_si_release_res_void
AFTER UPDATE ON public.sales_invoices
FOR EACH ROW EXECUTE FUNCTION public.tg_si_release_reservation_on_void();

-- =====================================================================
-- 7) Audit logs (best-effort, ignore if helper missing)
-- =====================================================================
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'audit_trigger') THEN
    EXECUTE 'CREATE TRIGGER trg_audit_sod AFTER INSERT OR UPDATE OR DELETE ON public.sales_order_deposits FOR EACH ROW EXECUTE FUNCTION public.audit_trigger()';
    EXECUTE 'CREATE TRIGGER trg_audit_sres AFTER INSERT OR UPDATE OR DELETE ON public.stock_reservations FOR EACH ROW EXECUTE FUNCTION public.audit_trigger()';
  END IF;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
