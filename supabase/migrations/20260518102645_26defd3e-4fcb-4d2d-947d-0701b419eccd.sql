CREATE TABLE public.bank_vouchers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  tenant_id uuid,
  bank_account_id uuid NOT NULL,
  voucher_type text NOT NULL CHECK (voucher_type IN ('receipt','payment','transfer_in','transfer_out')),
  voucher_no text NOT NULL,
  voucher_date date NOT NULL DEFAULT CURRENT_DATE,
  amount numeric NOT NULL CHECK (amount > 0),
  counter_account text NOT NULL,
  party_id uuid,
  party_name text,
  reason text,
  reference text,
  journal_entry_id uuid,
  bank_transaction_id uuid,
  transfer_pair_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_bank_vouchers_account_date ON public.bank_vouchers(bank_account_id, voucher_date DESC);
CREATE INDEX idx_bank_vouchers_tenant ON public.bank_vouchers(tenant_id);
CREATE INDEX idx_bank_vouchers_user ON public.bank_vouchers(user_id);

ALTER TABLE public.bank_vouchers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own bank_vouchers all" ON public.bank_vouchers
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "tenant bank_vouchers select" ON public.bank_vouchers
  FOR SELECT USING (tenant_id IS NOT NULL AND is_tenant_member(auth.uid(), tenant_id));

CREATE POLICY "tenant bank_vouchers insert" ON public.bank_vouchers
  FOR INSERT WITH CHECK (
    tenant_id IS NOT NULL
    AND tenant_id = current_tenant_id()
    AND has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin','accountant'])
  );

CREATE POLICY "tenant bank_vouchers update" ON public.bank_vouchers
  FOR UPDATE USING (
    tenant_id IS NOT NULL AND has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin','accountant'])
  ) WITH CHECK (
    tenant_id IS NOT NULL AND has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin','accountant'])
  );

CREATE POLICY "tenant bank_vouchers delete" ON public.bank_vouchers
  FOR DELETE USING (
    tenant_id IS NOT NULL AND has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin','accountant'])
  );