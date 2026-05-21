
-- 1. Bảng phiếu mua hàng
CREATE TABLE public.purchase_vouchers (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  voucher_no text NOT NULL,
  voucher_date date NOT NULL DEFAULT CURRENT_DATE,

  -- Nhà cung cấp
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  supplier_name text,
  supplier_tax_id text,

  -- Liên kết hóa đơn mua (tuỳ chọn)
  invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  invoice_no text,
  invoice_date date,

  -- Nội dung
  reason text,
  currency text DEFAULT 'VND',
  subtotal numeric(18,2) NOT NULL DEFAULT 0,
  vat_rate numeric(5,2) NOT NULL DEFAULT 0,
  vat_amount numeric(18,2) NOT NULL DEFAULT 0,
  total numeric(18,2) NOT NULL DEFAULT 0,

  -- Định khoản
  debit_account text NOT NULL DEFAULT '156',
  credit_account text NOT NULL DEFAULT '331',
  vat_account text DEFAULT '1331',

  -- Thanh toán
  payment_method text NOT NULL DEFAULT 'credit'
    CHECK (payment_method IN ('credit','cash','bank')),
  payment_account text,
  pay_now boolean NOT NULL DEFAULT false,

  -- Nhập kho
  create_stock_voucher boolean NOT NULL DEFAULT false,
  warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE SET NULL,

  -- Liên kết nghiệp vụ sinh ra
  journal_entry_id uuid REFERENCES public.journal_entries(id) ON DELETE SET NULL,
  stock_voucher_id uuid REFERENCES public.stock_vouchers(id) ON DELETE SET NULL,
  cash_voucher_id uuid REFERENCES public.cash_vouchers(id) ON DELETE SET NULL,
  bank_voucher_id uuid REFERENCES public.bank_vouchers(id) ON DELETE SET NULL,

  -- Chiều phân tích
  branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  cost_center_id uuid REFERENCES public.cost_centers(id) ON DELETE SET NULL,

  -- Trạng thái
  status text NOT NULL DEFAULT 'uploaded'
    CHECK (status IN ('uploaded','ai_read','reviewed','posted','void','rejected')),
  posted_at timestamptz,
  voided_at timestamptz,
  void_reason text,
  notes text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (tenant_id, voucher_no)
);

CREATE INDEX idx_pv_tenant_date ON public.purchase_vouchers(tenant_id, voucher_date DESC);
CREATE INDEX idx_pv_tenant_status ON public.purchase_vouchers(tenant_id, status);
CREATE INDEX idx_pv_supplier ON public.purchase_vouchers(tenant_id, supplier_id);
CREATE INDEX idx_pv_invoice ON public.purchase_vouchers(invoice_id) WHERE invoice_id IS NOT NULL;
CREATE INDEX idx_pv_user ON public.purchase_vouchers(user_id, voucher_date DESC);

ALTER TABLE public.purchase_vouchers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pv_select_member" ON public.purchase_vouchers FOR SELECT
  USING (tenant_id IS NOT NULL AND public.is_tenant_member(auth.uid(), tenant_id));

CREATE POLICY "pv_insert_member" ON public.purchase_vouchers FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND tenant_id IS NOT NULL
    AND public.is_tenant_member(auth.uid(), tenant_id)
  );

CREATE POLICY "pv_update_member" ON public.purchase_vouchers FOR UPDATE
  USING (tenant_id IS NOT NULL AND public.is_tenant_member(auth.uid(), tenant_id))
  WITH CHECK (tenant_id IS NOT NULL AND public.is_tenant_member(auth.uid(), tenant_id));

CREATE POLICY "pv_delete_admin" ON public.purchase_vouchers FOR DELETE
  USING (
    tenant_id IS NOT NULL
    AND public.has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin','accountant'])
  );

-- Trigger
CREATE TRIGGER trg_pv_updated_at
  BEFORE UPDATE ON public.purchase_vouchers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_pv_status_transition
  BEFORE UPDATE OF status ON public.purchase_vouchers
  FOR EACH ROW EXECUTE FUNCTION public.enforce_document_status_transition();

CREATE TRIGGER trg_pv_status_history
  AFTER UPDATE OF status ON public.purchase_vouchers
  FOR EACH ROW EXECUTE FUNCTION public.log_document_status_change();

CREATE TRIGGER trg_pv_dim_tenant
  BEFORE INSERT OR UPDATE ON public.purchase_vouchers
  FOR EACH ROW EXECUTE FUNCTION public.assert_dim_same_tenant();

CREATE TRIGGER trg_pv_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.purchase_vouchers
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();

-- 2. Bảng dòng chi tiết
CREATE TABLE public.purchase_voucher_lines (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  voucher_id uuid NOT NULL REFERENCES public.purchase_vouchers(id) ON DELETE CASCADE,
  line_order int NOT NULL DEFAULT 0,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  description text,
  qty numeric(18,4) NOT NULL DEFAULT 1,
  unit_price numeric(18,2) NOT NULL DEFAULT 0,
  amount numeric(18,2) NOT NULL DEFAULT 0,
  vat_rate numeric(5,2) NOT NULL DEFAULT 0,
  line_type text NOT NULL DEFAULT 'goods'
    CHECK (line_type IN ('goods','service','expense','asset')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_pvl_voucher ON public.purchase_voucher_lines(voucher_id);

ALTER TABLE public.purchase_voucher_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pvl_all_via_parent" ON public.purchase_voucher_lines
  USING (EXISTS (
    SELECT 1 FROM public.purchase_vouchers pv
    WHERE pv.id = purchase_voucher_lines.voucher_id
      AND pv.tenant_id IS NOT NULL
      AND public.is_tenant_member(auth.uid(), pv.tenant_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.purchase_vouchers pv
    WHERE pv.id = purchase_voucher_lines.voucher_id
      AND pv.tenant_id IS NOT NULL
      AND public.is_tenant_member(auth.uid(), pv.tenant_id)
  ));
