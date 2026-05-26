## Kế hoạch P3.5 — Vendor Item Reconciliation (3 việc)

Smoke test (mục J) tạm hoãn theo yêu cầu. Tập trung 3 mục chặn UX & hiệu năng:

### A. Auto-cache nhanh hơn

**Vấn đề**: cache L1 yêu cầu `confidence ≥ 0.9` **và** `match_count ≥ 3` → user phải confirm 3 lần cho cùng một dòng mới được auto.

**Sửa**
- Trong `resolver.server.ts` (L1): cho phép auto khi
  - `confidence ≥ 0.95` **và** `match_count ≥ 1`, **hoặc**
  - `confidence ≥ 0.9` **và** `match_count ≥ 3` (giữ luật cũ).
- Trong `confirmItemMapping` (`mappings.functions.ts`): khi user **chấp nhận đề xuất nguyên si** (product_id trùng với gợi ý hiện tại), bump `match_count += 1`, set `confidence = min(1, confidence + 0.05)`. Khi user **đổi product khác**, ghi `item_resolution_log` với `method='user_override'` + `signals.prev_product_id` để sau này calibrate.

### D. Áp dụng `unit_conversion_factor` vào proposal

**Vấn đề**: factor đã lưu trong `supplier_item_mappings` nhưng `enrichInvoiceWithItemResolution` không nhân vào qty/cost → proposal vẫn dùng số gốc của NCC (1 thùng) thay vì hệ thống (24 chai).

**Sửa**
- Trong `enrichInvoiceWithItemResolution`: khi `result.method === "cache"` và `cached.unit_factor !== 1`:
  - `qty_system = qty_raw * unit_factor`
  - `unit_price_system = unit_price_raw / unit_factor`
  - Gắn `resolution.unit_converted = { factor, from: raw_unit, to: product.unit }` vào `ProposalItem`.
- Trong `inbox-item-sheet.tsx` (cột Mã hệ thống): khi có `unit_converted`, hiện badge phụ `1 ${from} → ${factor} ${to}` (text muted, xs).

### F. Index HNSW cho pgvector

**Vấn đề**: `match_products_for_vendor` đang seq scan toàn `product_embeddings` của tenant. Catalog > 5k sp sẽ chậm rõ rệt.

**Sửa** — 1 migration:
```sql
create index if not exists product_embeddings_hnsw
  on public.product_embeddings
  using hnsw (embedding vector_cosine_ops)
  with (m = 16, ef_construction = 64);

create index if not exists vendor_raw_embeddings_hnsw
  on public.vendor_raw_embeddings
  using hnsw (embedding vector_cosine_ops)
  with (m = 16, ef_construction = 64);
```
Index build chạy ~vài giây trên catalog hiện tại (vài chục sp). Tenant lớn hơn sẽ lock ngắn — chấp nhận được vì bảng này write thấp.

### Hồ sơ thay đổi

| File | Thay đổi |
|------|----------|
| `supabase/migrations/<new>.sql` | 2 index HNSW |
| `src/lib/items/resolver.server.ts` | L1 ngưỡng kép (0.95/1 hoặc 0.9/3) |
| `src/lib/items/mappings.functions.ts` | `confirmItemMapping` bump match_count + confidence khi accept-as-is; log `user_override` khi đổi product |
| `src/lib/inbox-ai.functions.ts` (hoặc nơi gọi enrich) | Nhân `unit_conversion_factor` vào qty/price; gắn `unit_converted` metadata |
| `src/components/inbox/inbox-item-sheet.tsx` | Badge phụ quy đổi đơn vị |
| `.lovable/plan.md` | Cập nhật tiến độ P3.5 |

### Ngoài phạm vi (làm sau)

- C/G/E/B/H/I/K trong rà soát trước — sẽ ưu tiên dần.
- J (smoke test 3 hoá đơn thật) — chờ data test.

Sau khi bạn duyệt, mình triển khai 3 mục trên trong một batch.