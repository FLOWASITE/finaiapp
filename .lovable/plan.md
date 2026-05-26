## Rà soát tiến độ — Vendor Item Reconciliation

### Đã xong

**Hạ tầng dữ liệu** — `supplier_item_mappings`, `item_resolution_log`, `products.aliases`, pgvector + `product_embeddings` + `vendor_raw_embeddings` + RPC `match_products_for_vendor`. RLS theo tenant. ✅

**Resolver core (`src/lib/items/`)** — `normalize.ts`, `resolver.server.ts` Layer 1 (cache) + Layer 2 (multi-signal, hard-reject khác đơn vị) + **Layer 2.5 semantic (pgvector, best-effort)** + Layer 3 LLM fallback (`llm-suggest.functions.ts`), audit log. ✅

**Server fns (`mappings.functions.ts`)** — `resolveInvoiceLines`, `confirmItemMapping`, `createProductFromRaw`, `list/deleteSupplierItemMapping`, `updateMappingProduct`, `searchProductsForMapping`, `listMappingConflicts`, **`bulkImportMappings`**. ✅

**Embeddings (`embeddings.server.ts`)** — `embedText`, `ensureProductEmbedding`, `semanticSearchProducts` qua Lovable AI Gateway (`google/gemini-embedding-001`, 768 dims). No-op nếu thiếu API key. ✅

**Pipeline integration (P0)**
- `enrichInvoiceWithItemResolution` chạy sau parse, gắn `product_id` khi `auto`. ✅
- Resolution metadata propagate qua `ProposalItem` → `inbox-reason.server.ts`. ✅

**UX (P0 + P1 + P2)**
- Cột "Mã hệ thống" với badge 🟢/🟡/🔵 trong `inbox-item-sheet.tsx`. ✅
- `ItemResolutionPanel` hỏi `unit_conversion_factor`. ✅
- "Nhờ Fin gợi ý" (Layer 3 LLM) trong panel. ✅
- **Badge "AI khớp X/Y" trên card inbox** (xanh nếu khớp 100%, vàng nếu có review, xanh dương nếu có mới). ✅
- `/settings/item-mappings`: filter NCC, inline edit qua `ProductPicker`, tab Xung đột, **dialog Nhập từ CSV** (paste/upload, parse + báo lỗi từng dòng). ✅

**Memory Graph** — `getMemoryGraphData` + `adaptDbToGraph` đọc thêm `supplier_item_mappings`, tạo node `prod:<id>` (label = mã sản phẩm) và cạnh vendor→item→account theo `stock_account`. Đã hiển thị trong tab "Trí nhớ AI". ✅

### Còn lại

| # | Mục | Ưu tiên |
|---|-----|---------|
| 1 | Smoke test 3 dòng (cache / review / new) trên hoá đơn thật | P1 |
| 2 | Backfill `product_embeddings` cho catalog hiện có (cron / nút thủ công ở `/settings/item-mappings`) | P3 |
| 3 | Trigger upsert embedding khi tạo/sửa `products` | P3 |
