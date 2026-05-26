-- Enable pgvector
create extension if not exists vector;

-- Embeddings per product (one row per product, embedded on name + aliases)
create table if not exists public.product_embeddings (
  product_id uuid primary key references public.products(id) on delete cascade,
  tenant_id uuid not null,
  source_text text not null,
  embedding vector(768) not null,
  model text not null default 'google/gemini-embedding-001',
  updated_at timestamptz not null default now()
);

create index if not exists product_embeddings_tenant_idx
  on public.product_embeddings (tenant_id);

create index if not exists product_embeddings_vec_idx
  on public.product_embeddings using hnsw (embedding vector_cosine_ops);

alter table public.product_embeddings enable row level security;

create policy "tenant members read product_embeddings"
  on public.product_embeddings for select
  using (
    exists (
      select 1 from public.tenant_members tm
      where tm.tenant_id = product_embeddings.tenant_id
        and tm.user_id = auth.uid()
        and tm.status = 'active'
    )
  );

create policy "tenant members write product_embeddings"
  on public.product_embeddings for all
  using (
    exists (
      select 1 from public.tenant_members tm
      where tm.tenant_id = product_embeddings.tenant_id
        and tm.user_id = auth.uid()
        and tm.status = 'active'
    )
  )
  with check (
    exists (
      select 1 from public.tenant_members tm
      where tm.tenant_id = product_embeddings.tenant_id
        and tm.user_id = auth.uid()
        and tm.status = 'active'
    )
  );

-- Embeddings cache per raw_name_norm seen on vendor invoices
create table if not exists public.vendor_raw_embeddings (
  tenant_id uuid not null,
  raw_name_norm text not null,
  embedding vector(768) not null,
  model text not null default 'google/gemini-embedding-001',
  updated_at timestamptz not null default now(),
  primary key (tenant_id, raw_name_norm)
);

create index if not exists vendor_raw_embeddings_vec_idx
  on public.vendor_raw_embeddings using hnsw (embedding vector_cosine_ops);

alter table public.vendor_raw_embeddings enable row level security;

create policy "tenant members read vendor_raw_embeddings"
  on public.vendor_raw_embeddings for select
  using (
    exists (
      select 1 from public.tenant_members tm
      where tm.tenant_id = vendor_raw_embeddings.tenant_id
        and tm.user_id = auth.uid()
        and tm.status = 'active'
    )
  );

create policy "tenant members write vendor_raw_embeddings"
  on public.vendor_raw_embeddings for all
  using (
    exists (
      select 1 from public.tenant_members tm
      where tm.tenant_id = vendor_raw_embeddings.tenant_id
        and tm.user_id = auth.uid()
        and tm.status = 'active'
    )
  )
  with check (
    exists (
      select 1 from public.tenant_members tm
      where tm.tenant_id = vendor_raw_embeddings.tenant_id
        and tm.user_id = auth.uid()
        and tm.status = 'active'
    )
  );

-- Nearest-neighbour search RPC: top-K products in tenant by cosine similarity
create or replace function public.match_products_for_vendor(
  p_tenant_id uuid,
  p_query_embedding vector(768),
  p_limit int default 5
)
returns table (
  product_id uuid,
  similarity double precision
)
language sql
stable
security definer
set search_path = public
as $$
  select
    pe.product_id,
    1 - (pe.embedding <=> p_query_embedding) as similarity
  from public.product_embeddings pe
  where pe.tenant_id = p_tenant_id
    and exists (
      select 1 from public.tenant_members tm
      where tm.tenant_id = p_tenant_id
        and tm.user_id = auth.uid()
        and tm.status = 'active'
    )
  order by pe.embedding <=> p_query_embedding
  limit p_limit;
$$;
