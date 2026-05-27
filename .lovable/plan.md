## Mục tiêu

- 170 mặt hàng "Thư viện chuẩn" nằm trong DB (không nằm trong frontend bundle) để AI dùng để đối chiếu tên hàng trên hóa đơn.
- Tab **Mục của tôi** chỉ hiển thị mặt hàng đã có giao dịch hoặc đã được copy thủ công từ thư viện → tức là các bản ghi trong bảng `products` của tenant hiện tại.
- Popup chọn hàng trong **Phiếu mua hàng / bán hàng** (`ProductPickerCell`) chỉ lấy từ `products` (đã đúng, chỉ cần xác nhận và giữ nguyên).
- Tab **Thư viện** đọc 170 mặt hàng từ DB; khi user "Thêm vào Mục của tôi" thì insert sang `products`.

## Việc cần làm

### 1. Seed 170 mặt hàng vào DB (một lần)

Đưa `SAMPLE_ITEMS` (đang hardcode ở `src/data/sample-catalog.ts`) vào bảng `tenant_product_catalog` dạng **template chung** (không gắn tenant). Vì bảng hiện có cột `tenant_id NOT NULL`, có hai lựa chọn:

- **Cách A (đơn giản, đề xuất):** thêm cột `is_global boolean default false`, cho phép `tenant_id` NULL khi `is_global=true`; mergeCatalog đọc cả bản ghi global + bản ghi của tenant. Cần migration + cập nhật RLS (`SELECT` cho authenticated khi `is_global=true OR tenant_id=current_tenant`).
- **Cách B:** seed 170 mặt hàng cho từng tenant khi tenant được tạo (trigger `on_tenant_created`). Tốn dung lượng, khó cập nhật thư viện sau này.

Chọn **Cách A**. Migration tạo cột + policy + insert 170 rows từ file `sample-catalog.ts` (script chạy 1 lần qua `supabase--insert`).

### 2. Cập nhật `loadCatalog`

`src/lib/catalog/catalog.functions.ts`:
- Query `tenant_product_catalog` bổ sung điều kiện `tenant_id.eq.{tenantId},is_global.eq.true` (OR).
- Vẫn truyền vào `mergeCatalog` như cũ. `mergeCatalog` đã đánh dấu `isActive:false, isAiSuggested:true` cho item từ TPC → đúng cho tab "Thư viện".

### 3. Bỏ ghép `SAMPLE_ITEMS` ở frontend

`src/components/catalog/CatalogPage.tsx`:
- Xoá import `SAMPLE_ITEMS` và đoạn `libraryExtras` trong `tabItems`.
- 3 tab dùng cùng một nguồn `items` (từ DB):
  - `mine`: `items.filter(i => i.isActive && !i.isAiSuggested)` — chỉ bản ghi `products`.
  - `library`: `items.filter(i => i.isAiSuggested)` — 170 từ TPC.
  - `suggested`: như cũ.

### 4. Xác nhận picker phiếu mua/bán

`ProductPickerCell` đã gọi `listProducts` (chỉ đọc bảng `products`) → đúng yêu cầu, không sửa.

### 5. Xoá file frontend `src/data/sample-catalog.ts`

Sau khi seed xong DB và confirm tab Thư viện hiển thị đủ 170 mặt hàng, xoá file để giảm bundle (~120KB).

## Chi tiết kỹ thuật

- Migration: `ALTER TABLE tenant_product_catalog ADD COLUMN is_global boolean NOT NULL DEFAULT false; ALTER TABLE tenant_product_catalog ALTER COLUMN tenant_id DROP NOT NULL; ALTER TABLE tenant_product_catalog ADD CONSTRAINT tpc_tenant_or_global CHECK (is_global OR tenant_id IS NOT NULL);` + cập nhật RLS SELECT policy.
- Seed: dùng `supabase--insert` với batch INSERT 170 rows (`sku`, `name`, `name_norm`, `aliases`, `note`, `is_global=true`, `tenant_id=null`).
- Adapter `tpcToCatalogItem` có sẵn `isAiSuggested:true` → tab Thư viện sẽ tự lọc đúng.

## Ngoài phạm vi

- Chưa làm hành động "Sao chép sang Mục của tôi" trong UI thư viện (nếu chưa có sẽ làm ở turn sau).
- Chưa làm logic AI matching dùng `tenant_product_catalog` (chỉ chuẩn bị dữ liệu).
