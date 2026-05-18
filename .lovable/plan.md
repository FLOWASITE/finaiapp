## Vấn đề hiện tại
Sidebar có 2 mục **"Hàng hoá & Dịch vụ"** và **"Kho"** nhưng cả hai đều trỏ về cùng layout `/_app/inventory` với cùng tabs (Tồn kho, Thẻ kho, Kiểm kê, Danh mục) → trùng lặp, không đúng chuẩn.

Phần mềm kế toán (Misa, Fast, Bravo…) tách rõ:
- **Danh mục HHDV** = dữ liệu chủ (mã, tên, ĐVT, giá bán, thuế suất, TK doanh thu/giá vốn/kho, loại hàng hoá/dịch vụ/combo).
- **Kho** = nghiệp vụ vận hành (tồn kho theo kho, nhập/xuất, thẻ kho, kiểm kê, danh mục kho).

## Cấu trúc đề xuất

```
Mua – Bán                          Kế toán
├── Hoá đơn điện tử                ├── Kho
├── Đối tác                        │   ├── Tồn kho hiện tại
├── Hàng hoá & Dịch vụ      <NEW>  │   ├── Phiếu nhập / xuất kho
│   ├── Danh sách HHDV             │   ├── Thẻ kho
│   ├── Nhóm hàng hoá              │   ├── Kiểm kê
│   └── Đơn vị tính (placeholder)  │   └── Danh mục kho (placeholder)
```

## Thay đổi route

**Tạo mới: `/items`** — Danh mục HHDV
- `src/routes/_app/items.tsx` (layout với tabs: Danh sách · Nhóm hàng hoá · Đơn vị tính)
- `src/routes/_app/items/index.tsx` — danh sách HHDV (chuyển phần quản lý sản phẩm từ `/inventory` hiện tại sang đây: form tạo/sửa, lọc theo loại goods/service/combo, danh mục). KHÔNG bao gồm các nút nhập/xuất kho.
- `src/routes/_app/items/categories.tsx` — chuyển từ `/inventory/categories`.
- `src/routes/_app/items/units.tsx` — placeholder "đang xây dựng".

**Đổi `/inventory`** — Kho (nghiệp vụ)
- `src/routes/_app/inventory.tsx` — tabs mới: **Tồn kho · Phiếu nhập / xuất · Thẻ kho · Kiểm kê · Danh mục kho**.
- `src/routes/_app/inventory/index.tsx` — chỉ hiển thị **báo cáo tồn kho** (bảng SKU · ĐVT · Tồn đầu · Nhập · Xuất · Tồn cuối · Cảnh báo tồn thấp) + KPI dashboard. Bỏ form thêm sản phẩm (chuyển sang `/items`). Giữ nút "Ghi nhận nhập/xuất nhanh" → mở dialog `recordMovement`.
- `src/routes/_app/inventory/movements.tsx` — danh sách phiếu nhập/xuất (đang là placeholder, giữ placeholder cải tiến + nút "Ghi nhận phiếu").
- `src/routes/_app/inventory/stock-card.tsx` *(mới)* — chọn 1 HHDV xem thẻ kho chi tiết theo từng phát sinh.
- `src/routes/_app/inventory/stock-takes.tsx` *(mới, placeholder)* — kiểm kê.
- `src/routes/_app/inventory/warehouses.tsx` *(mới, placeholder)* — danh mục kho.
- Xoá tab "Danh mục" khỏi layout Kho (đã chuyển sang /items).
- Xoá `src/routes/_app/inventory/categories.tsx` (thay bằng redirect tới `/items/categories`).

## Sidebar (`src/components/app-sidebar.tsx`)
Đổi 2 dòng hiện tại thành:
```ts
{ to: "/items", label: "Hàng hoá & Dịch vụ", icon: Package },
{ to: "/inventory", label: "Kho", icon: Warehouse },
```

## Cập nhật phụ
- `src/components/command-palette.tsx`: thêm mục "Hàng hoá & Dịch vụ" → `/items`, đổi nhãn "Kho" giữ → `/inventory`, thêm "Phiếu nhập/xuất" → `/inventory/movements`, "Thẻ kho" → `/inventory/stock-card`.
- `src/components/page-breadcrumbs.tsx`: thêm nhãn `items: "Hàng hoá & Dịch vụ"`, `units: "Đơn vị tính"`, `"stock-card": "Thẻ kho"`, `"stock-takes": "Kiểm kê"`, `warehouses: "Danh mục kho"`.

## Backend
**Không đổi schema, không đổi server functions.** `inventory.functions.ts` đã có sẵn `listProducts`, `listCategories`, `getStockReport`, `recordMovement`, `inventoryDashboard` — dùng chung cho cả `/items` (CRUD products/categories) lẫn `/inventory` (report + movements).

## Kết quả
- `/items` = nơi duy nhất khai báo & quản lý dữ liệu sản phẩm/dịch vụ.
- `/inventory` = nơi duy nhất xem tồn kho và ghi nhận nghiệp vụ kho.
- Không còn trùng nội dung giữa 2 mục sidebar.