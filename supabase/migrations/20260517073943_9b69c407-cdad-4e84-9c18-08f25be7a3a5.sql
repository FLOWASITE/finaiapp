
create table public.bank_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  name text not null,
  bank_name text,
  account_no text,
  currency text not null default 'VND',
  opening_balance numeric not null default 0,
  gl_account_code text not null default '1121',
  created_at timestamptz not null default now()
);
alter table public.bank_accounts enable row level security;
create policy "own bank_accounts all" on public.bank_accounts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table public.bank_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  bank_account_id uuid not null references public.bank_accounts(id) on delete cascade,
  txn_date date not null,
  description text,
  amount numeric not null,
  running_balance numeric,
  counterparty text,
  status text not null default 'unmatched',
  matched_entry_id uuid,
  match_confidence numeric,
  match_reason text,
  created_at timestamptz not null default now()
);
alter table public.bank_transactions enable row level security;
create policy "own bank_transactions all" on public.bank_transactions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index on public.bank_transactions(user_id, txn_date);

create table public.fixed_assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  code text not null,
  name text not null,
  cost numeric not null,
  salvage_value numeric not null default 0,
  useful_life_months integer not null,
  start_date date not null,
  method text not null default 'straight_line',
  asset_account text not null default '211',
  accumulated_account text not null default '214',
  expense_account text not null default '6422',
  status text not null default 'active',
  notes text,
  created_at timestamptz not null default now()
);
alter table public.fixed_assets enable row level security;
create policy "own fixed_assets all" on public.fixed_assets
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table public.depreciation_entries (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.fixed_assets(id) on delete cascade,
  period_month date not null,
  amount numeric not null,
  journal_entry_id uuid,
  created_at timestamptz not null default now(),
  unique (asset_id, period_month)
);
alter table public.depreciation_entries enable row level security;
create policy "own depreciation_entries all" on public.depreciation_entries
  for all using (exists (
    select 1 from public.fixed_assets a where a.id = depreciation_entries.asset_id and a.user_id = auth.uid()
  )) with check (exists (
    select 1 from public.fixed_assets a where a.id = depreciation_entries.asset_id and a.user_id = auth.uid()
  ));
