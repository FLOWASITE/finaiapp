create index if not exists product_embeddings_hnsw
  on public.product_embeddings
  using hnsw (embedding vector_cosine_ops)
  with (m = 16, ef_construction = 64);

create index if not exists vendor_raw_embeddings_hnsw
  on public.vendor_raw_embeddings
  using hnsw (embedding vector_cosine_ops)
  with (m = 16, ef_construction = 64);