## Vấn đề

170 mặt hàng thư viện trong DB hiện không có thông tin nhóm danh mục. Hàm `tpcToCatalogItem` trong `src/lib/catalog/adapt.ts` đang hard-code `category: "VAN_PHONG"` cho mọi bản ghi `tenant_product_catalog`, nên khi mở tab **Thư viện**, sidebar "Nhóm danh mục" gom hết 170 item vào một nhóm duy nhất (Văn phòng – Hành chính), thay vì phân về 22 nhóm như thiết kế (Tiện ích, Viễn thông, Logistics, F&B, Healthcare…).

## Mục tiêu

Khôi phục đúng `category` (và `subcategory`) cho 170 mặt hàng global, để:
- Sidebar nhóm danh mục ở tab **Thư viện** đếm và lọc đúng theo 22 nhóm.
- AI khi đối chiếu tên hàng trên hóa đơn nhận được gợi ý nhóm/tài khoản chính xác hơn.
- Khi user "Sao chép sang Mục của tôi" (bước sau), `products` cũng kế thừa được nhóm đúng.

## Thay đổi

### 1. DB — thêm cột phân loại cho thư viện
Migration mới trên `public.tenant_product_catalog`:
- `category text` (mã nhóm, ví dụ `TIEN_ICH`, `FNB`…)
- `subcategory text NULL`
- `item_type text NULL` (`service` / `goods` / `mixed`) — để adapter không phải đoán
- `default_account text NULL` — tài khoản mặc định (TT133) gợi ý
- `vat_rate numeric NULL` — thuế suất VAT chuẩn
- Index phụ trợ: `idx_tpc_category (category) WHERE is_global = true`.

Không tạo bảng mới, không đổi RLS hiện hành.

### 2. Backfill 170 bản ghi global
Dùng `supabase--insert` chạy `UPDATE … WHERE sku = '…' AND is_global = true` theo lô, lấy dữ liệu gốc từ `SAMPLE_ITEMS` (vẫn còn trong git HEAD: `src/data/sample-catalog.ts`). Script sinh SQL được chạy trong sandbox, không commit file `sample-catalog.ts` trở lại repo.

Bản ghi nào không khớp SKU (rất hiếm) sẽ giữ NULL → adapter fallback về `VAN_PHONG` như hiện tại để không vỡ UI.

### 3. `src/lib/catalog/adapt.ts`
- Mở rộng interface `DbTpcRow` thêm các cột mới ở (1).
- `tpcToCatalogItem` đọc `category`, `subcategory`, `item_type`, `default_account`, `vat_rate` từ DB; fallback hợp lý khi NULL.
- Đảm bảo `category` ép kiểu về `CategoryCode` an toàn (map qua `CATEGORY_BY_CODE`; nếu mã lạ → `VAN_PHONG`).

### 4. `src/lib/catalog/catalog.functions.ts`
- Trong `loadCatalog`, mở rộng `.select(...)` của `tenant_product_catalog` để lấy thêm các cột mới.

### 5. Không đổi UI
`CategorySidebar`, `CatalogPage`, `ItemList` giữ nguyên — chúng đã group theo `item.category` nên tự động hoạt động sau khi adapter trả về đúng nhóm.

## Out of scope

- Hành động "Sao chép sang Mục của tôi" trong tab Thư viện.
- Logic AI sử dụng `category` để gợi ý tài khoản (sẽ làm ở bước tiếp theo).
- Thêm/sửa/xóa item global từ UI (vẫn chỉ qua migration/script).
