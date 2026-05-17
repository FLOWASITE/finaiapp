
-- Profiles
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  company_name text,
  tax_id text,
  accounting_standard text not null default 'TT133',
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
create policy "own profile select" on public.profiles for select using (auth.uid() = id);
create policy "own profile update" on public.profiles for update using (auth.uid() = id);
create policy "own profile insert" on public.profiles for insert with check (auth.uid() = id);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Chart of Accounts (shared seed, read-only for all)
create table public.chart_of_accounts (
  code text primary key,
  name text not null,
  type text not null check (type in ('ASSET','LIABILITY','EQUITY','REVENUE','EXPENSE')),
  parent_code text
);
alter table public.chart_of_accounts enable row level security;
create policy "coa readable" on public.chart_of_accounts for select using (auth.role() = 'authenticated');

-- Suppliers
create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tax_id text,
  name text not null,
  address text,
  risk_flag text,
  created_at timestamptz not null default now(),
  unique (user_id, tax_id)
);
alter table public.suppliers enable row level security;
create policy "own suppliers all" on public.suppliers for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Invoices
create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  file_path text not null,
  supplier_id uuid references public.suppliers(id) on delete set null,
  supplier_name text,
  supplier_tax_id text,
  invoice_no text,
  issue_date date,
  subtotal numeric(18,2) default 0,
  vat_amount numeric(18,2) default 0,
  total numeric(18,2) default 0,
  currency text default 'VND',
  status text not null default 'pending' check (status in ('pending','extracted','reviewed','approved','failed')),
  raw_ocr jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.invoices enable row level security;
create policy "own invoices all" on public.invoices for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index on public.invoices (user_id, created_at desc);

-- Invoice lines
create table public.invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  description text,
  qty numeric(18,4) default 1,
  unit_price numeric(18,2) default 0,
  amount numeric(18,2) default 0,
  vat_rate numeric(5,2) default 0
);
alter table public.invoice_lines enable row level security;
create policy "own invoice_lines all" on public.invoice_lines for all
  using (exists (select 1 from public.invoices i where i.id = invoice_id and i.user_id = auth.uid()))
  with check (exists (select 1 from public.invoices i where i.id = invoice_id and i.user_id = auth.uid()));

-- Journal entries
create table public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  invoice_id uuid references public.invoices(id) on delete set null,
  entry_date date not null default current_date,
  description text,
  created_at timestamptz not null default now()
);
alter table public.journal_entries enable row level security;
create policy "own journal_entries all" on public.journal_entries for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index on public.journal_entries (user_id, entry_date desc);

-- Journal lines
create table public.journal_lines (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.journal_entries(id) on delete cascade,
  account_code text not null references public.chart_of_accounts(code),
  debit numeric(18,2) not null default 0,
  credit numeric(18,2) not null default 0,
  line_order int not null default 0
);
alter table public.journal_lines enable row level security;
create policy "own journal_lines all" on public.journal_lines for all
  using (exists (select 1 from public.journal_entries e where e.id = entry_id and e.user_id = auth.uid()))
  with check (exists (select 1 from public.journal_entries e where e.id = entry_id and e.user_id = auth.uid()));

-- AI Suggestions
create table public.ai_suggestions (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  suggestions jsonb not null,
  chosen_index int,
  feedback text,
  created_at timestamptz not null default now()
);
alter table public.ai_suggestions enable row level security;
create policy "own ai_suggestions all" on public.ai_suggestions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Storage bucket for invoices (private)
insert into storage.buckets (id, name, public) values ('invoices', 'invoices', false)
on conflict (id) do nothing;

create policy "invoices read own" on storage.objects for select
  using (bucket_id = 'invoices' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "invoices insert own" on storage.objects for insert
  with check (bucket_id = 'invoices' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "invoices delete own" on storage.objects for delete
  using (bucket_id = 'invoices' and auth.uid()::text = (storage.foldername(name))[1]);

-- Seed Chart of Accounts (TT133 - rút gọn các TK thường dùng cho SME)
insert into public.chart_of_accounts (code, name, type, parent_code) values
('111','Tiền mặt','ASSET',null),
('1111','Tiền Việt Nam','ASSET','111'),
('112','Tiền gửi ngân hàng','ASSET',null),
('1121','Tiền VN gửi ngân hàng','ASSET','112'),
('131','Phải thu của khách hàng','ASSET',null),
('133','Thuế GTGT được khấu trừ','ASSET',null),
('1331','Thuế GTGT được khấu trừ của hàng hóa, dịch vụ','ASSET','133'),
('1332','Thuế GTGT được khấu trừ của TSCĐ','ASSET','133'),
('141','Tạm ứng','ASSET',null),
('152','Nguyên liệu, vật liệu','ASSET',null),
('153','Công cụ, dụng cụ','ASSET',null),
('154','Chi phí SXKD dở dang','ASSET',null),
('155','Thành phẩm','ASSET',null),
('156','Hàng hóa','ASSET',null),
('211','Tài sản cố định','ASSET',null),
('214','Hao mòn TSCĐ','ASSET',null),
('242','Chi phí trả trước','ASSET',null),
('331','Phải trả cho người bán','LIABILITY',null),
('333','Thuế và các khoản phải nộp Nhà nước','LIABILITY',null),
('3331','Thuế GTGT phải nộp','LIABILITY','333'),
('3334','Thuế TNDN','LIABILITY','333'),
('3335','Thuế TNCN','LIABILITY','333'),
('334','Phải trả người lao động','LIABILITY',null),
('338','Phải trả, phải nộp khác','LIABILITY',null),
('341','Vay và nợ thuê tài chính','LIABILITY',null),
('411','Vốn đầu tư của chủ sở hữu','EQUITY',null),
('421','Lợi nhuận sau thuế chưa phân phối','EQUITY',null),
('511','Doanh thu bán hàng và cung cấp dịch vụ','REVENUE',null),
('515','Doanh thu hoạt động tài chính','REVENUE',null),
('632','Giá vốn hàng bán','EXPENSE',null),
('635','Chi phí tài chính','EXPENSE',null),
('642','Chi phí quản lý kinh doanh','EXPENSE',null),
('6421','Chi phí bán hàng','EXPENSE','642'),
('6422','Chi phí quản lý doanh nghiệp','EXPENSE','642'),
('711','Thu nhập khác','REVENUE',null),
('811','Chi phí khác','EXPENSE',null),
('821','Chi phí thuế TNDN','EXPENSE',null),
('911','Xác định kết quả kinh doanh','EQUITY',null)
on conflict (code) do nothing;
