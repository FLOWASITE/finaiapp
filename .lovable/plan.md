## Rà soát tiến độ — Vendor Item Reconciliation

### Đã xong (cập nhật)

**Hạ tầng dữ liệu** — `supplier_item_mappings`, `item_resolution_log`, `products.aliases`. RLS theo tenant. ✅

**Resolver core (`src/lib/items/`)** — `normalize.ts` (NFD + Jaccard/Levenshtein), `resolver.server.ts` Layer 1 (cache exact) + Layer 2 (multi-signal, hard-reject khác đơn vị), audit log. ✅

**Server fns (`mappings.functions.ts`)** — `resolveInvoiceLines`, `confirmItemMapping`, `createProductFromRaw`, `list/deleteSupplierItemMapping`, `updateMappingProduct`, `searchProductsForMapping`, `listMappingConflicts`. ✅

**Pipeline integration (P0)**
- `enrichInvoiceWithItemResolution` chạy sau `parse-document` (cả 3 nhánh: XML / cache / AI). Tự gắn `product_id` khi `status='auto'` để Agent Hạch toán chọn đúng TK 152/153/156. ✅
- Resolution metadata propagate qua `ProposalItem` → `inbox-reason.server.ts`. ✅

**UX (P0)**
- Refactor thành cột **"Mã hệ thống"** trong bảng goods (`inbox-item-sheet.tsx`) với badge 🟢/🟡/🔵 theo status. ✅
- `ItemResolutionPanel`: hỏi `unit_conversion_factor` khi `raw_unit ≠ product.unit` (cho cả confirm và create). ✅

**Power-user — `/settings/item-mappings` (P1)**
- Filter dropdown theo NCC. ✅
- Inline edit `product_id` qua `ProductPicker` (combobox tìm theo mã/tên). ✅
- Tab **Xung đột**: nhóm các `raw_name_norm` map về ≥2 product_id khác nhau, kèm xoá nhanh. ✅

### Còn lại

| # | Mục | Ưu tiên |
|---|-----|---------|
| 1 | Smoke test 3 dòng (cache hit / review / new) trên hoá đơn thật | P1 |
| 2 | Lớp 3 LLM fallback ("Nhờ Fin gợi ý" khi status='new') | P2 |
| 3 | Embedding semantic (pgvector) | P2 |
| 4 | Bulk import CSV mapping | P2 |
| 5 | Tab "Trí nhớ AI" / Memory Graph view | P2 (chờ shell `ai-memory`) |
| 6 | Visual cue trong list inbox (badge "AI khớp X/Y dòng") | P2 |
