## Mục tiêu

Vòng 1 (tối thiểu hữu dụng) cho trang **Hàng hóa & Dịch vụ** (`/inventory`):
1. Phân biệt **Hàng hóa** vs **Dịch vụ** (và Combo) trong cùng bảng `products`.
2. Hoàn thiện tab **Danh mục** (`/inventory/categories`) thành CRUD cây phân cấp, có gán nhóm hàng loạt.

## 1. Phân biệt Hàng hóa / Dịch vụ / Combo

### Schema (migration)
Thêm cột `item_type` vào `products`:
- Enum text với CHECK: `'goods' | 'service' | 'combo'`, default `'goods'`.
- Index `idx_products_item_type`.
- Dịch vụ: bỏ qua quản lý tồn (UI ẩn các trường tồn, server không tạo `stock_movements`, mặc định TK kho = `null`/`154`).

### Server (`src/lib/inventory.functions.ts`)
- `ProductSchema`: thêm `item_type: z.enum(['goods','service','combo']).default('goods')`.
- `recordMovement`: throw lỗi nếu `product.item_type === 'service'` ("Dịch vụ không quản lý tồn").
- `listProducts` / `getStockReport`: trả thêm `item_type`; `inventoryDashboard` chỉ tính tồn cho `item_type='goods'`.
- KPI "Số SKU" → tách thành "Hàng hóa" và "Dịch vụ" (2 KPI nhỏ).

### UI
- **Form Mặt hàng** (`ProductDialog` trong `src/routes/_app/inventory/index.tsx`):
  - Trường đầu tiên: `Select` Loại (Hàng hóa / Dịch vụ / Combo).
  - Nếu là Dịch vụ: ẩn các trường Giá vốn, Tồn tối thiểu/tối đa, TK kho, TK giá vốn; mặc định không cho mở dialog Nhập/Xuất kho.
- **Bảng danh sách**: thêm cột "Loại" (Badge: 📦 Hàng / 🛎 Dịch vụ / 🧩 Combo); filter "Loại" trong thanh filter.
- **MovementDialog**: chỉ liệt kê SKU có `item_type='goods'`.
- **Detail page** (`/inventory/$id`): nếu Dịch vụ → ẩn KPI Tồn / Kardex, hiện thông báo "Dịch vụ không quản lý tồn".

## 2. Hoàn thiện tab Danh mục

### Server (`src/lib/inventory.functions.ts`)
Bổ sung 2 server fn:
- `listCategoriesTree`: trả về danh mục + đếm số SKU thuộc nhóm (cho lá), tự dựng `children[]` từ `parent_id`.
- `bulkAssignCategory({ product_ids: string[], category_id: string | null })`: update nhiều SKU một lần.

### UI mới (`src/routes/_app/inventory/categories.tsx`) — thay placeholder
Layout 2 cột:
- **Cột trái — Cây danh mục**:
  - Render đệ quy (indent theo cấp), mỗi node có: tên, badge số SKU, menu `…` (Sửa / Thêm nhóm con / Xoá).
  - Nút "+ Nhóm mới" ở đầu (parent = null).
  - Dialog Thêm/Sửa: Tên + Select Nhóm cha (loại trừ chính nó & con cháu để tránh chu trình).
  - Xoá: confirm; chặn nếu còn SKU hoặc còn nhóm con (báo lỗi rõ ràng).
- **Cột phải — SKU trong nhóm đang chọn**:
  - Bảng nhỏ (Mã, Tên, Loại, Tồn) + checkbox chọn nhiều.
  - Thanh hành động khi có chọn: "Chuyển sang nhóm…" (Select → mutate `bulkAssignCategory`).
  - Nút "Bỏ phân nhóm" (set category_id = null).

### Cập nhật trang chính
- `ProductDialog` thay `Select` nhóm hiện tại bằng cây phân cấp (đường dẫn "Cha › Con") để dễ chọn.

## Phạm vi không nằm trong vòng 1
- Import/Export Excel, mã vạch/in tem, ảnh sản phẩm, bảng giá nhiều mức, kiểm kê, thẻ kho — sẽ làm ở vòng sau.

## Files

**Tạo mới**
- (không có file mới ngoài migration)

**Sửa**
- `src/lib/inventory.functions.ts` — thêm `item_type`, `listCategoriesTree`, `bulkAssignCategory`, chặn movement cho service.
- `src/routes/_app/inventory/index.tsx` — UI chọn loại, filter loại, cột loại, ẩn trường khi service.
- `src/routes/_app/inventory/categories.tsx` — thay placeholder bằng trang cây danh mục + gán hàng loạt.
- `src/routes/_app/inventory/$id.tsx` — ẩn Kardex/KPI tồn cho dịch vụ.

**Migration**
```sql
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS item_type text NOT NULL DEFAULT 'goods'
  CHECK (item_type IN ('goods','service','combo'));
CREATE INDEX IF NOT EXISTS idx_products_item_type ON public.products(item_type);
```
