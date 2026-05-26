## Rà soát tiến độ — Vendor Item Reconciliation

So với `.lovable/plan.md` (MVP đề ra 4 lớp + power-user shell):

### Đã xong

**Hạ tầng dữ liệu**
- Migration `20260526042648_*` đã tạo: `supplier_item_mappings` (có `unit_conversion_factor`, `confidence`, `match_count`, `source`), `item_resolution_log` (audit JSONB signals), `products.aliases text[]`. RLS theo `tenant_id` + role. ✅
- `pgvector` / `embedding` — bỏ qua đúng kế hoạch (để V2). ✅

**Resolver core (`src/lib/items/`)**
- `normalize.ts`: NFD strip dấu, collapse space, Jaccard + Levenshtein. ✅
- `resolver.server.ts` Lớp 1 (cache exact, ngưỡng `confidence ≥ 0.9 & match_count ≥ 3` → auto). ✅
- Lớp 2 (multi-signal: text 0.55 + unit 0.2 + price 0.1 + history 0.1 + sku 0.05, hard-reject khi đơn vị khác nhóm). ✅
- Ghi `item_resolution_log` cho mọi quyết định (best-effort). ✅

**Server fns (`mappings.functions.ts`)**
- `resolveInvoiceLines` (qua `supplier_id` hoặc `supplier_tax_id`). ✅
- `confirmItemMapping` (upsert rule, tăng `match_count`, `source='user_confirm'`). ✅
- `createProductFromRaw` (tạo product + tạo mapping luôn). ✅
- `listSupplierItemMappings` + `deleteSupplierItemMapping`. ✅

**UX trong Inbox sheet**
- `ItemResolutionPanel` mount trong `inbox-item-sheet.tsx`, nhận đúng `activeTenantId` (đã fix turn vừa rồi). ✅
- 3 trạng thái: 🟢 Auto (badge + số lần đã ghép) / 🟡 Review (radio top-3, 1-click confirm + "tạo mã mới") / 🔵 New (inline form: mã gợi ý từ tên, ĐVT, chọn 156/152/153/dịch vụ). ✅

**Power-user**
- `/settings/item-mappings`: bảng tất cả rule, search theo `raw_name`, xoá. Shortcut card trên trang Cài đặt. ✅

### Còn thiếu / lệch kế hoạch

| # | Mục | Trạng thái | Ghi chú |
|---|-----|-----------|---------|
| 1 | **Tích hợp resolver vào pipeline parse hoá đơn** | ❌ Chưa | Hiện resolver chỉ chạy **lazy** khi KTV mở sheet. Plan ban đầu là "gọi sau khi có lines, trước khi propose journal" để Agent Hạch toán có `product_id` mà chọn TK 152/153/156 chính xác. |
| 2 | **Unit conversion factor (case #1)** | ⚠️ Nửa | Schema có cột, nhưng UI `confirm` / `create` đang hardcode `factor=1`. Khi NCC ghi "thùng" mà product là "lon" thì không hỏi quy đổi → kho sẽ sai khi tự khớp. |
| 3 | **UX vị trí** | ⚠️ Lệch | Plan đề xuất "inline + thêm cột 'Mã hệ thống' + badge" trong bảng goods/services hiện có. Đã build là **section riêng phía dưới** bảng. Xài được, nhưng KTV phải nhìn 2 chỗ. |
| 4 | **Lớp 3 — LLM fallback** | ❌ Chưa | Đúng plan (V2, tắt mặc định). Hook chưa cắm. |
| 5 | **Power-user nâng cao** | ⚠️ Sơ sài | Trang `item-mappings` mới có: list + search + delete. Chưa có: filter theo NCC dropdown, edit inline (đổi product_id), merge/split, conflict detector ("cùng raw_name nhưng map 2 product khác nhau giữa các NCC"), bulk import CSV. |
| 6 | **Smoke test 3 dòng (cache / review / new)** | ❌ Chưa | Chưa chạy. |
| 7 | **Tab "Trí nhớ AI" / nhãn dán** | ❌ N/A | Plan có nhắc, nhưng app chưa có panel `ai-memory` để hook vào. |

### Đề xuất ưu tiên cho lần build tiếp theo

**P0 — đóng MVP đúng nghĩa**
1. **Hỏi unit conversion factor khi confirm/create** nếu `raw_unit ≠ product.unit`: 1 ô input nhỏ "1 [raw_unit] = ? [product.unit]". Đây là gốc rễ chính xác kho — không thể bỏ.
2. **Tích hợp resolver vào parse pipeline**: sau khi `parse-document` xong và có `supplier_tax_id`, gọi `resolveVendorLine` cho từng dòng → gắn `product_id` (nếu auto) vào `proposal.items[i].product_id` để Agent Hạch toán dùng đúng TK 152/153/156 (giải bài toán lõi của project).

**P1 — power user**
3. Filter theo NCC (dropdown) + edit inline product_id trong `/settings/item-mappings`.
4. Conflict detector: nhóm các raw_name_norm có ≥2 product_id khác nhau (chỉ cảnh báo, không auto-merge).

**P2 — V2 (chừa)**
5. Lớp 3 LLM (nút "Nhờ Fin gợi ý" trong panel khi status='new').
6. Embedding semantic, Memory Graph view, bulk import.

### Câu cần chốt trước khi build tiếp

1. Làm P0 (#1 unit factor + #2 tích hợp parse pipeline) trước, hay làm P1 (power-user nâng cao) trước?
2. UX: giữ section riêng như hiện tại, hay refactor thành **cột "Mã hệ thống"** ngay trong bảng `ProposalItemsList` (đúng plan ban đầu)?
3. Khi auto-match ở pipeline parse (P0 #2): có hiển thị visual cue ngay trong bảng goods chính (vd badge nhỏ cạnh tên hàng) để KTV biết đã được resolve không?
