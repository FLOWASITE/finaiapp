-- ============================================
-- Phân hệ Tài sản phân bổ (TK 242 — CCDC / CPTT)
-- ============================================

-- 1. Sổ tài sản phân bổ
CREATE TABLE public.allocated_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  category text NOT NULL DEFAULT 'ccdc'
    CHECK (category IN ('ccdc','rent','insurance','license','repair','interest','other')),
  source_type text NOT NULL DEFAULT 'direct_expense'
    CHECK (source_type IN ('purchase_invoice','inventory_issue','fa_conversion','direct_expense','opening_balance')),
  source_doc_table text,
  source_doc_id uuid,
  quantity numeric NOT NULL DEFAULT 1,
  unit text,
  cost numeric NOT NULL CHECK (cost >= 0),
  allocated numeric NOT NULL DEFAULT 0 CHECK (allocated >= 0),
  periods_total integer NOT NULL CHECK (periods_total >= 1),
  periods_done integer NOT NULL DEFAULT 0 CHECK (periods_done >= 0),
  period_unit text NOT NULL DEFAULT 'month' CHECK (period_unit IN ('month','quarter','year')),
  start_date date NOT NULL,
  method text NOT NULL DEFAULT 'straight_line' CHECK (method IN ('straight_line','custom_ratio')),
  prepaid_account text NOT NULL DEFAULT '242',
  expense_account text NOT NULL DEFAULT '6423',
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','suspended','disposed','finished')),
  branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  cost_center_id uuid REFERENCES public.cost_centers(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);

CREATE INDEX idx_alloc_assets_tenant ON public.allocated_assets(tenant_id);
CREATE INDEX idx_alloc_assets_status ON public.allocated_assets(tenant_id, status);
CREATE INDEX idx_alloc_assets_category ON public.allocated_assets(tenant_id, category);

ALTER TABLE public.allocated_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant alloc_assets select" ON public.allocated_assets FOR SELECT
  USING (tenant_id IS NOT NULL AND public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "tenant alloc_assets insert" ON public.allocated_assets FOR INSERT
  WITH CHECK (tenant_id IS NOT NULL AND tenant_id = public.current_tenant_id()
    AND public.has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin','accountant']));
CREATE POLICY "tenant alloc_assets update" ON public.allocated_assets FOR UPDATE
  USING (tenant_id IS NOT NULL AND public.has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin','accountant']))
  WITH CHECK (tenant_id IS NOT NULL AND public.has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin','accountant']));
CREATE POLICY "tenant alloc_assets delete" ON public.allocated_assets FOR DELETE
  USING (tenant_id IS NOT NULL AND public.has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin','accountant']));

CREATE TRIGGER trg_alloc_assets_updated_at
  BEFORE UPDATE ON public.allocated_assets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_alloc_assets_dim_tenant_guard
  BEFORE INSERT OR UPDATE ON public.allocated_assets
  FOR EACH ROW EXECUTE FUNCTION public.assert_dim_same_tenant();

CREATE TRIGGER audit_allocated_assets
  AFTER INSERT OR UPDATE OR DELETE ON public.allocated_assets
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();


-- 2. Đối tượng nhận chi phí phân bổ (nhiều PB/dự án theo tỉ lệ)
CREATE TABLE public.allocated_asset_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES public.allocated_assets(id) ON DELETE CASCADE,
  target_type text NOT NULL CHECK (target_type IN ('department','project','cost_center','branch')),
  target_ref_id uuid NOT NULL,
  ratio_percent numeric NOT NULL DEFAULT 100 CHECK (ratio_percent > 0 AND ratio_percent <= 100),
  expense_account text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_alloc_targets_asset ON public.allocated_asset_targets(asset_id);

ALTER TABLE public.allocated_asset_targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant alloc_targets select" ON public.allocated_asset_targets FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.allocated_assets a
    WHERE a.id = allocated_asset_targets.asset_id
      AND public.is_tenant_member(auth.uid(), a.tenant_id)));
CREATE POLICY "tenant alloc_targets write" ON public.allocated_asset_targets FOR ALL
  USING (EXISTS (SELECT 1 FROM public.allocated_assets a
    WHERE a.id = allocated_asset_targets.asset_id
      AND public.has_tenant_role(auth.uid(), a.tenant_id, ARRAY['owner','admin','accountant'])))
  WITH CHECK (EXISTS (SELECT 1 FROM public.allocated_assets a
    WHERE a.id = allocated_asset_targets.asset_id
      AND public.has_tenant_role(auth.uid(), a.tenant_id, ARRAY['owner','admin','accountant'])));


-- 3. Lịch sử phân bổ từng kỳ
CREATE TABLE public.allocation_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES public.allocated_assets(id) ON DELETE CASCADE,
  period_month date NOT NULL,
  amount numeric NOT NULL CHECK (amount >= 0),
  journal_entry_id uuid REFERENCES public.journal_entries(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (asset_id, period_month)
);

CREATE INDEX idx_alloc_entries_asset ON public.allocation_entries(asset_id);
CREATE INDEX idx_alloc_entries_period ON public.allocation_entries(period_month);

ALTER TABLE public.allocation_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant alloc_entries select" ON public.allocation_entries FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.allocated_assets a
    WHERE a.id = allocation_entries.asset_id
      AND public.is_tenant_member(auth.uid(), a.tenant_id)));
CREATE POLICY "tenant alloc_entries write" ON public.allocation_entries FOR ALL
  USING (EXISTS (SELECT 1 FROM public.allocated_assets a
    WHERE a.id = allocation_entries.asset_id
      AND public.has_tenant_role(auth.uid(), a.tenant_id, ARRAY['owner','admin','accountant'])))
  WITH CHECK (EXISTS (SELECT 1 FROM public.allocated_assets a
    WHERE a.id = allocation_entries.asset_id
      AND public.has_tenant_role(auth.uid(), a.tenant_id, ARRAY['owner','admin','accountant'])));


-- 4. Nhật ký điều chỉnh
CREATE TABLE public.allocated_asset_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES public.allocated_assets(id) ON DELETE CASCADE,
  adj_date date NOT NULL,
  type text NOT NULL CHECK (type IN ('increase','decrease','change_periods','suspend','resume','dispose')),
  delta_cost numeric NOT NULL DEFAULT 0,
  delta_periods integer NOT NULL DEFAULT 0,
  reason text,
  journal_entry_id uuid REFERENCES public.journal_entries(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_alloc_adj_asset ON public.allocated_asset_adjustments(asset_id);

ALTER TABLE public.allocated_asset_adjustments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant alloc_adj select" ON public.allocated_asset_adjustments FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.allocated_assets a
    WHERE a.id = allocated_asset_adjustments.asset_id
      AND public.is_tenant_member(auth.uid(), a.tenant_id)));
CREATE POLICY "tenant alloc_adj write" ON public.allocated_asset_adjustments FOR ALL
  USING (EXISTS (SELECT 1 FROM public.allocated_assets a
    WHERE a.id = allocated_asset_adjustments.asset_id
      AND public.has_tenant_role(auth.uid(), a.tenant_id, ARRAY['owner','admin','accountant'])))
  WITH CHECK (EXISTS (SELECT 1 FROM public.allocated_assets a
    WHERE a.id = allocated_asset_adjustments.asset_id
      AND public.has_tenant_role(auth.uid(), a.tenant_id, ARRAY['owner','admin','accountant'])));


-- 5. Hàm validate tổng tỉ lệ <= 100 (chạy sau insert/update/delete targets)
CREATE OR REPLACE FUNCTION public.validate_alloc_targets_sum()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_asset_id uuid;
  v_total numeric;
BEGIN
  v_asset_id := COALESCE(NEW.asset_id, OLD.asset_id);
  SELECT COALESCE(SUM(ratio_percent), 0) INTO v_total
    FROM public.allocated_asset_targets WHERE asset_id = v_asset_id;
  IF v_total > 100.001 THEN
    RAISE EXCEPTION 'Tổng tỉ lệ phân bổ vượt 100%% (hiện: %)', v_total;
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;

CREATE TRIGGER trg_alloc_targets_sum
  AFTER INSERT OR UPDATE OR DELETE ON public.allocated_asset_targets
  FOR EACH ROW EXECUTE FUNCTION public.validate_alloc_targets_sum();
