## Rà soát tiến độ — Vendor Item Reconciliation

### P0–P3 đã xong (tóm tắt)
- Hạ tầng dữ liệu (mappings, log, embeddings, RPC, RLS).
- Resolver 4 lớp (cache / fuzzy multi-signal / pgvector / LLM).
- Pipeline + UX (inbox badge, panel, /settings/item-mappings, bulk import CSV, Memory Graph, backfill).
- Auto embed khi tạo/sửa product.

### P3.5 đã xong (vòng này)
- **A. Cache auto nhanh hơn**: ngưỡng kép `confidence ≥ 0.95 ∧ match_count ≥ 1` HOẶC `≥ 0.9 ∧ ≥ 3`. `confirmItemMapping` bump confidence (+0.05) khi user accept-as-is. Log `user_override` khi user đổi product (cả `confirmItemMapping` lẫn `updateMappingProduct`).
- **D. Áp dụng `unit_conversion_factor`** trong `enrichInvoiceWithItemResolution`: chỉ khi `auto` từ cache, qty *= factor, unit_price /= factor, gắn `unit_converted` metadata. Badge phụ "1 thùng → 24 chai" trong inbox-item-sheet.
- **F. HNSW index** cho `product_embeddings.embedding` và `vendor_raw_embeddings.embedding` (cosine, m=16, ef_construction=64).

### Còn lại

| # | Mục | Ưu tiên |
|---|-----|---------|
| J | Smoke test 3 hoá đơn thật (cache / review / new) | Chờ data |
| C | (đã làm 1 phần ở P3.5) — calibrate trọng số từ `user_override` log | P4 |
| G | Tách `semantic` thành signal riêng (weight ~0.15) thay vì pha vào text | P4 |
| E | `supplier_item_last_price` cho priceScore chính xác theo NCC | P4 |
| B | pg_trgm thay heuristic 2-từ-đầu khi lấy candidate L2 | P4 |
| H | Backfill embedding paginate + cron tự chạy | P5 |
| I | Flow gộp xung đột (giữ A xoá B + dồn match_count) | P5 |
| K | Phân biệt mapping nguồn LLM trong `source` | P5 |
