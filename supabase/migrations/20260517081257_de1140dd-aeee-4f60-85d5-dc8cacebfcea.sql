
-- customers
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  name text not null,
  tax_id text,
  address text,
  email text,
  phone text,
  created_at timestamptz not null default now()
);
alter table public.customers enable row level security;
create policy "own customers all" on public.customers for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- products
create table public.products (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  code text not null,
  name text not null,
  unit text not null default 'cái',
  unit_cost numeric not null default 0,
  unit_price numeric not null default 0,
  stock_account text not null default '156',
  revenue_account text not null default '511',
  cogs_account text not null default '632',
  vat_rate numeric not null default 10,
  on_hand numeric not null default 0,
  created_at timestamptz not null default now()
);
create unique index products_user_code_idx on public.products(user_id, code);
alter table public.products enable row level security;
create policy "own products all" on public.products for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- stock_movements
create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  product_id uuid not null references public.products(id) on delete cascade,
  movement_type text not null check (movement_type in ('in','out')),
  qty numeric not null,
  unit_cost numeric not null default 0,
  ref_type text,
  ref_id uuid,
  movement_date date not null default current_date,
  note text,
  created_at timestamptz not null default now()
);
create index stock_movements_user_idx on public.stock_movements(user_id, movement_date);
alter table public.stock_movements enable row level security;
create policy "own stock_movements all" on public.stock_movements for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- cash_vouchers
create table public.cash_vouchers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  voucher_no text not null,
  voucher_type text not null check (voucher_type in ('receipt','payment')),
  voucher_date date not null default current_date,
  amount numeric not null,
  cash_account text not null default '1111',
  counter_account text not null,
  party_name text,
  reason text,
  journal_entry_id uuid,
  created_at timestamptz not null default now()
);
create index cash_vouchers_user_idx on public.cash_vouchers(user_id, voucher_date);
alter table public.cash_vouchers enable row level security;
create policy "own cash_vouchers all" on public.cash_vouchers for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- sales_invoices
create table public.sales_invoices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  customer_id uuid,
  customer_name text,
  customer_tax_id text,
  invoice_series text default '1C26TAA',
  invoice_no text,
  issue_date date not null default current_date,
  subtotal numeric not null default 0,
  vat_amount numeric not null default 0,
  total numeric not null default 0,
  currency text not null default 'VND',
  status text not null default 'draft' check (status in ('draft','issued','cancelled')),
  einvoice_code text,
  einvoice_qr text,
  journal_entry_id uuid,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index sales_invoices_user_idx on public.sales_invoices(user_id, issue_date);
alter table public.sales_invoices enable row level security;
create policy "own sales_invoices all" on public.sales_invoices for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- sales_invoice_lines
create table public.sales_invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.sales_invoices(id) on delete cascade,
  product_id uuid,
  description text not null,
  qty numeric not null default 1,
  unit_price numeric not null default 0,
  amount numeric not null default 0,
  vat_rate numeric not null default 10
);
alter table public.sales_invoice_lines enable row level security;
create policy "own sales_invoice_lines all" on public.sales_invoice_lines for all using (
  exists (select 1 from public.sales_invoices i where i.id = sales_invoice_lines.invoice_id and i.user_id = auth.uid())
) with check (
  exists (select 1 from public.sales_invoices i where i.id = sales_invoice_lines.invoice_id and i.user_id = auth.uid())
);
