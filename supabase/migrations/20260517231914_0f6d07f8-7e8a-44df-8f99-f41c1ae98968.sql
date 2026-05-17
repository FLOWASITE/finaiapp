
-- SUPPLIERS expansion
ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS code text,
  ADD COLUMN IF NOT EXISTS contact_person text,
  ADD COLUMN IF NOT EXISTS website text,
  ADD COLUMN IF NOT EXISTS fax text,
  ADD COLUMN IF NOT EXISTS bank_account_no text,
  ADD COLUMN IF NOT EXISTS bank_name text,
  ADD COLUMN IF NOT EXISTS bank_branch text,
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'VND',
  ADD COLUMN IF NOT EXISTS opening_balance_debit numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS opening_balance_credit numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payable_account text NOT NULL DEFAULT '331',
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS party_type text NOT NULL DEFAULT 'company',
  ADD COLUMN IF NOT EXISTS legal_rep text;

CREATE UNIQUE INDEX IF NOT EXISTS suppliers_user_code_uniq
  ON public.suppliers (user_id, code) WHERE code IS NOT NULL;

-- CUSTOMERS expansion
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS website text,
  ADD COLUMN IF NOT EXISTS fax text,
  ADD COLUMN IF NOT EXISTS bank_account_no text,
  ADD COLUMN IF NOT EXISTS bank_name text,
  ADD COLUMN IF NOT EXISTS bank_branch text,
  ADD COLUMN IF NOT EXISTS opening_balance_debit numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS opening_balance_credit numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS receivable_account text NOT NULL DEFAULT '131',
  ADD COLUMN IF NOT EXISTS party_type text NOT NULL DEFAULT 'company',
  ADD COLUMN IF NOT EXISTS legal_rep text;

-- Backfill opening balance từ cột cũ
UPDATE public.customers
SET opening_balance_debit  = GREATEST(COALESCE(opening_balance, 0), 0),
    opening_balance_credit = GREATEST(-COALESCE(opening_balance, 0), 0)
WHERE opening_balance IS NOT NULL
  AND opening_balance_debit = 0
  AND opening_balance_credit = 0;
