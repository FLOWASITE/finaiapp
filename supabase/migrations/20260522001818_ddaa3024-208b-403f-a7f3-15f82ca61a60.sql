
-- ============ sales_vouchers ============
CREATE TABLE public.sales_vouchers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  tenant_id uuid,
  voucher_no text NOT NULL,
  voucher_date date NOT NULL DEFAULT CURRENT_DATE,
  due_date date,
  customer_id uuid,
  customer_name text,
  customer_tax_id text,
  customer_address text,
  customer_group text,
  buyer_name text,
  salesperson_id uuid,
  salesperson_name text,
  reason text,
  currency text DEFAULT 'VND',
  exchange_rate numeric(18,6) NOT NULL DEFAULT 1,
  subtotal numeric(18,2) NOT NULL DEFAULT 0,
  discount_pct numeric(5,2) NOT NULL DEFAULT 0,
  discount_amount numeric(18,2) NOT NULL DEFAULT 0,
  vat_amount numeric(18,2) NOT NULL DEFAULT 0,
  total numeric(18,2) NOT NULL DEFAULT 0,
  paid_amount numeric(18,2) NOT NULL DEFAULT 0,
  debit_account text NOT NULL DEFAULT '1311',
  credit_account text NOT NULL DEFAULT '5111',
  vat_account text DEFAULT '33311',
  payment_method text NOT NULL DEFAULT 'credit' CHECK (payment_method IN ('credit','cash','bank')),
  payment_account text,
  payment_status text NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid','partial','paid')),
  pay_now boolean NOT NULL DEFAULT false,
  issue_einvoice boolean NOT NULL DEFAULT false,
  create_stock_voucher boolean NOT NULL DEFAULT false,
  warehouse_id uuid,
  einvoice_id uuid,
  stock_voucher_id uuid,
  cash_voucher_id uuid,
  bank_voucher_id uuid,
  sales_order_id uuid,
  journal_entry_id uuid,
  branch_id uuid,
  department_id uuid,
  project_id uuid,
  cost_center_id uuid,
  status text NOT NULL DEFAULT 'uploaded',
  posted_at timestamptz,
  voided_at timestamptz,
  void_reason text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_sv_tenant_date ON public.sales_vouchers(tenant_id, voucher_date DESC);
CREATE INDEX idx_sv_tenant_status ON public.sales_vouchers(tenant_id, status);
CREATE INDEX idx_sv_customer ON public.sales_vouchers(tenant_id, customer_id);

ALTER TABLE public.sales_vouchers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sv_select" ON public.sales_vouchers FOR SELECT TO authenticated
  USING (tenant_id IS NOT NULL AND public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "sv_insert" ON public.sales_vouchers FOR INSERT TO authenticated
  WITH CHECK (tenant_id IS NOT NULL AND public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "sv_update" ON public.sales_vouchers FOR UPDATE TO authenticated
  USING (tenant_id IS NOT NULL AND public.is_tenant_member(auth.uid(), tenant_id))
  WITH CHECK (tenant_id IS NOT NULL AND public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "sv_delete" ON public.sales_vouchers FOR DELETE TO authenticated
  USING (tenant_id IS NOT NULL AND public.is_tenant_member(auth.uid(), tenant_id));

CREATE TRIGGER set_sv_updated_at BEFORE UPDATE ON public.sales_vouchers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER assert_sv_dim_tenant BEFORE INSERT OR UPDATE ON public.sales_vouchers
  FOR EACH ROW EXECUTE FUNCTION public.assert_dim_same_tenant();

CREATE TRIGGER audit_sv AFTER INSERT OR UPDATE OR DELETE ON public.sales_vouchers
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();

-- ============ sales_voucher_lines ============
CREATE TABLE public.sales_voucher_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  voucher_id uuid NOT NULL REFERENCES public.sales_vouchers(id) ON DELETE CASCADE,
  line_order int NOT NULL DEFAULT 0,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  product_code text,
  product_name text,
  description text,
  unit text,
  qty numeric(18,4) NOT NULL DEFAULT 1,
  unit_price numeric(18,2) NOT NULL DEFAULT 0,
  amount numeric(18,2) NOT NULL DEFAULT 0,
  discount_pct numeric(5,2) NOT NULL DEFAULT 0,
  discount_amount numeric(18,2) NOT NULL DEFAULT 0,
  vat_rate numeric(5,2) NOT NULL DEFAULT 0,
  vat_amount numeric(18,2) NOT NULL DEFAULT 0,
  total numeric(18,2) NOT NULL DEFAULT 0,
  debit_account text,
  credit_account text,
  vat_account text,
  cost_amount numeric(18,2) NOT NULL DEFAULT 0,
  line_type text NOT NULL DEFAULT 'goods' CHECK (line_type IN ('goods','service')),
  sales_order_line_id uuid,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_svl_voucher ON public.sales_voucher_lines(voucher_id);

ALTER TABLE public.sales_voucher_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "svl_all_via_parent" ON public.sales_voucher_lines FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.sales_vouchers sv
    WHERE sv.id = sales_voucher_lines.voucher_id
      AND sv.tenant_id IS NOT NULL
      AND public.is_tenant_member(auth.uid(), sv.tenant_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.sales_vouchers sv
    WHERE sv.id = sales_voucher_lines.voucher_id
      AND sv.tenant_id IS NOT NULL
      AND public.is_tenant_member(auth.uid(), sv.tenant_id)
  ));
