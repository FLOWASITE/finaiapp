## Mục tiêu
Hoàn thiện `/inventory/warehouses` để quản lý nhiều kho (kho tổng, kho chi nhánh…) và cho phép gán kho khi nhập/xuất kho và khi kiểm kê.

## 1. Database (migration)

**Tạo bảng `warehouses`:**
- `id`, `user_id`, `tenant_id`, `created_at`, `updated_at`
- `code text NOT NULL` (mã kho, ví dụ `KHO01`)
- `name text NOT NULL` (tên kho)
- `address text`, `manager text`, `phone text`, `notes text`
- `is_default boolean DEFAULT false` (kho mặc định khi tạo phiếu)
- `is_active boolean DEFAULT true`
- UNIQUE `(tenant_id, code)` và `(user_id, code)`
- RLS theo chuẩn tenant + own (giống `products`, `bank_accounts`)
- Trigger `updated_at`

**Gắn kho vào nghiệp vụ tồn:**
- `stock_movements`: thêm `warehouse_id uuid REFERENCES warehouses(id) ON DELETE SET NULL` + index `(warehouse_id, movement_date)`
- `stock_takes`: thêm `warehouse_id uuid REFERENCES warehouses(id) ON DELETE SET NULL` (giữ cột `warehouse` text cũ cho dữ liệu legacy, hiển thị fallback)
- Cho phép chuyển kho: thêm `transfer_id uuid` trên `stock_movements` để gom 2 dòng in/out của cùng phiếu chuyển kho (cùng `ref_type='transfer'`)

**Seed:** với mỗi tenant đang có dữ liệu tồn, tự sinh 1 kho mặc định `KHO01 – Kho chính` và gán `warehouse_id` cho movements/takes hiện có.

## 2. Server functions — `src/lib/warehouses.functions.ts`
- `listWarehouses()` — trả về danh sách + số sản phẩm/giá trị tồn theo kho (group từ `stock_movements`)
- `upsertWarehouse({ id?, code, name, address?, manager?, phone?, notes?, is_default?, is_active? })` — auto-code qua `nextEntityCode` nếu trống
- `deleteWarehouse({ id })` — chặn xoá nếu còn movements; cho phép "ngưng hoạt động" thay thế
- `setDefaultWarehouse({ id })` — bỏ cờ default ở các kho khác

Bổ sung entity `warehouse` vào `src/lib/codegen.functions.ts` (prefix `KHO`, padLen 2).

## 3. UI — `src/routes/_app/inventory/warehouses.tsx`
Layout chuẩn DataTable (giống `customers`/`suppliers`):
- Header: tiêu đề + nút **"Thêm kho"** + ô tìm kiếm
- Bảng: Mã | Tên kho | Địa chỉ | Quản lý | SL mã hàng | Tồn (giá trị) | Mặc định (badge) | Trạng thái | Hành động (Sửa/Xoá/Đặt mặc định)
- `WarehouseDialog`: form gồm `AutoCodeInput` (entity=`warehouse`), Tên, Địa chỉ, Người quản lý, SĐT, Ghi chú, Switch "Kho mặc định", Switch "Đang hoạt động". Có nút **Lưu** và **Lưu & thêm mới**, shortcut Ctrl+S.
- Validate trùng mã client-side; toast lỗi DB 23505.
- Empty state hướng dẫn tạo kho đầu tiên.

## 4. Wire vào các trang tồn kho
- **`/inventory` (nhập/xuất nhanh)**: thêm Select "Kho" (mặc định = kho `is_default`), lưu `warehouse_id` vào `stock_movements`. Thêm filter "Kho" trên bảng tồn để xem tồn theo từng kho.
- **`/inventory/movements`**: bảng phiếu nhập/xuất hiển thị cột Kho; filter theo kho + theo loại + theo khoảng ngày.
- **`/inventory/stock-takes`**: form tạo phiếu kiểm kê đổi field `warehouse` text → `Select` chọn `warehouse_id` (bắt buộc).
- **`/inventory/stock-card` & `/inventory/$id`**: thêm filter kho; hiển thị tồn cuối kỳ theo từng kho.

## 5. Ngoài phạm vi (không làm lần này)
- Phiếu chuyển kho riêng (transfer document UI) — chỉ chuẩn bị schema, UI để lần sau.
- Tồn kho theo lot/serial, theo vị trí trong kho.
- Phân quyền truy cập theo kho.

## Ghi chú kỹ thuật
- `on_hand` trên `products` vẫn là tổng tất cả kho; tồn theo kho tính động từ `SUM(stock_movements)` theo `warehouse_id`.
- Giữ backward-compat: movements/takes cũ không có `warehouse_id` sẽ được seed gán về kho mặc định trong migration.
