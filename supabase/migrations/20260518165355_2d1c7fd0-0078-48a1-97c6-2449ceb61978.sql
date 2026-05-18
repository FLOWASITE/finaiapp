
ALTER TABLE public.fixed_assets ADD COLUMN IF NOT EXISTS barcode text;
CREATE UNIQUE INDEX IF NOT EXISTS fixed_assets_tenant_barcode_uk
  ON public.fixed_assets(tenant_id, barcode) WHERE barcode IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.fa_disposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  asset_id uuid NOT NULL REFERENCES public.fixed_assets(id) ON DELETE CASCADE,
  disposal_date date NOT NULL,
  disposal_type text NOT NULL CHECK (disposal_type IN ('liquidation','sale','loss','donation','capital_contribution')),
  reason text,
  buyer_party_id uuid,
  sale_amount numeric(18,2) DEFAULT 0,
  sale_vat numeric(18,2) DEFAULT 0,
  proceeds_account text DEFAULT '1111',
  vat_output_account text DEFAULT '33311',
  disposal_cost numeric(18,2) DEFAULT 0,
  disposal_cost_account text DEFAULT '1111',
  cost_snapshot numeric(18,2) NOT NULL,
  accumulated_snapshot numeric(18,2) NOT NULL,
  residual_value numeric(18,2) NOT NULL,
  gain_loss numeric(18,2) NOT NULL,
  other_income_account text DEFAULT '711',
  other_expense_account text DEFAULT '811',
  asset_account text DEFAULT '211',
  accumulated_account text DEFAULT '214',
  journal_entry_id uuid REFERENCES public.journal_entries(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'posted' CHECK (status IN ('draft','posted','void')),
  void_reason text,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fa_disposals_tenant_idx ON public.fa_disposals(tenant_id, disposal_date DESC);
CREATE INDEX IF NOT EXISTS fa_disposals_asset_idx ON public.fa_disposals(asset_id);
ALTER TABLE public.fa_disposals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_select_fa_disposals" ON public.fa_disposals FOR SELECT USING (tenant_id = current_tenant_id());
CREATE POLICY "tenant_insert_fa_disposals" ON public.fa_disposals FOR INSERT WITH CHECK (tenant_id = current_tenant_id());
CREATE POLICY "tenant_update_fa_disposals" ON public.fa_disposals FOR UPDATE USING (tenant_id = current_tenant_id());
CREATE POLICY "tenant_delete_fa_disposals" ON public.fa_disposals FOR DELETE USING (tenant_id = current_tenant_id());
CREATE TRIGGER trg_fa_disposals_updated BEFORE UPDATE ON public.fa_disposals FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.fa_reclassifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  asset_id uuid NOT NULL REFERENCES public.fixed_assets(id) ON DELETE CASCADE,
  reclass_date date NOT NULL,
  direction text NOT NULL CHECK (direction IN ('fa_to_tool','tool_to_fa')),
  target_account text NOT NULL,
  allocation_months integer DEFAULT 0,
  cost_snapshot numeric(18,2) NOT NULL,
  accumulated_snapshot numeric(18,2) NOT NULL,
  residual_value numeric(18,2) NOT NULL,
  asset_account text DEFAULT '211',
  accumulated_account text DEFAULT '214',
  expense_account text DEFAULT '6422',
  reason text,
  journal_entry_id uuid REFERENCES public.journal_entries(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'posted' CHECK (status IN ('draft','posted','void')),
  void_reason text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fa_reclass_tenant_idx ON public.fa_reclassifications(tenant_id, reclass_date DESC);
ALTER TABLE public.fa_reclassifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_select_fa_reclass" ON public.fa_reclassifications FOR SELECT USING (tenant_id = current_tenant_id());
CREATE POLICY "tenant_insert_fa_reclass" ON public.fa_reclassifications FOR INSERT WITH CHECK (tenant_id = current_tenant_id());
CREATE POLICY "tenant_update_fa_reclass" ON public.fa_reclassifications FOR UPDATE USING (tenant_id = current_tenant_id());
CREATE POLICY "tenant_delete_fa_reclass" ON public.fa_reclassifications FOR DELETE USING (tenant_id = current_tenant_id());
CREATE TRIGGER trg_fa_reclass_updated BEFORE UPDATE ON public.fa_reclassifications FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.fa_inventory_counts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  code text NOT NULL,
  count_date date NOT NULL,
  branch_id uuid,
  department_id uuid,
  location text,
  description text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','in_progress','posted','void')),
  posted_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS fa_inv_counts_tenant_code_uk ON public.fa_inventory_counts(tenant_id, code);
ALTER TABLE public.fa_inventory_counts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_select_fa_inv_counts" ON public.fa_inventory_counts FOR SELECT USING (tenant_id = current_tenant_id());
CREATE POLICY "tenant_insert_fa_inv_counts" ON public.fa_inventory_counts FOR INSERT WITH CHECK (tenant_id = current_tenant_id());
CREATE POLICY "tenant_update_fa_inv_counts" ON public.fa_inventory_counts FOR UPDATE USING (tenant_id = current_tenant_id());
CREATE POLICY "tenant_delete_fa_inv_counts" ON public.fa_inventory_counts FOR DELETE USING (tenant_id = current_tenant_id());
CREATE TRIGGER trg_fa_inv_counts_updated BEFORE UPDATE ON public.fa_inventory_counts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.fa_inventory_count_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  count_id uuid NOT NULL REFERENCES public.fa_inventory_counts(id) ON DELETE CASCADE,
  asset_id uuid REFERENCES public.fixed_assets(id) ON DELETE SET NULL,
  scanned_code text,
  expected_location text,
  found_location text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','matched','missing','extra','wrong_location','damaged')),
  notes text,
  scanned_at timestamptz,
  scanned_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fa_inv_lines_count_idx ON public.fa_inventory_count_lines(count_id);
CREATE UNIQUE INDEX IF NOT EXISTS fa_inv_lines_count_asset_uk
  ON public.fa_inventory_count_lines(count_id, asset_id) WHERE asset_id IS NOT NULL;
ALTER TABLE public.fa_inventory_count_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_select_fa_inv_lines" ON public.fa_inventory_count_lines FOR SELECT USING (tenant_id = current_tenant_id());
CREATE POLICY "tenant_insert_fa_inv_lines" ON public.fa_inventory_count_lines FOR INSERT WITH CHECK (tenant_id = current_tenant_id());
CREATE POLICY "tenant_update_fa_inv_lines" ON public.fa_inventory_count_lines FOR UPDATE USING (tenant_id = current_tenant_id());
CREATE POLICY "tenant_delete_fa_inv_lines" ON public.fa_inventory_count_lines FOR DELETE USING (tenant_id = current_tenant_id());
