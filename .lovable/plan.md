## Mục tiêu
- Sidebar: bỏ nhóm "Bán hàng" (không còn dropdown sub-items). Thay bằng 1 mục đơn `Bán hàng` → vào `/sales` (Tổng quan).
- Trang Bán hàng có **tab bar** ở đầu, gồm: **Tổng quan · Đơn đặt hàng · Phiếu bán hàng · Hoá đơn bán · Hàng bán bị trả lại · Công nợ phải thu**.
- Bỏ hẳn mục **Phiếu thu** khỏi sidebar (route `/receipts` vẫn giữ, chỉ ẩn khỏi nav).

## Thay đổi

### 1. `src/components/app-sidebar.tsx`
Thay block group "Bán hàng" hiện tại:
```ts
{ label: "Bán hàng", icon: ShoppingCart, items: [ ... 6 items, gồm Phiếu thu ] }
```
bằng 1 NavLeaf:
```ts
{ to: "/sales", label: "Bán hàng", icon: ShoppingCart }
```
Active state cho `/sales` cần match cả các route con (`/sales/*`, `/invoices`, `/receivables`, `/sales-returns`) để mục sáng đúng khi user đang ở các tab — sẽ kiểm tra trong `useRouterState().location.pathname`.

### 2. Component tab dùng chung
Tạo `src/components/sales/SalesTabs.tsx`:
- Render 6 tab dạng `<Link>` (TanStack Router, dùng `to` tuyệt đối, không nội suy params).
- Tự highlight tab active dựa trên `pathname`.
- Tabs:
  | Label | to |
  |---|---|
  | Tổng quan | `/sales` |
  | Đơn đặt hàng | `/sales/orders` |
  | Phiếu bán hàng | `/sales/vouchers` |
  | Hoá đơn bán | `/invoices` |
  | Hàng bán bị trả lại | `/sales/returns` |
  | Công nợ phải thu | `/receivables` |

Gắn `<SalesTabs />` vào đầu các page: `_app/sales/index.tsx`, `_app/sales/orders.tsx`, `_app/sales/vouchers.tsx`, `_app/invoices/index.tsx`, `_app/receivables/index.tsx`, và route mới `_app/sales/returns.tsx`.

### 3. Route mới `/sales/returns`
Tạo `src/routes/_app/sales/returns.tsx` — placeholder page "Hàng bán bị trả lại" (empty state + nút "Tạo phiếu trả lại" disabled), kèm `<SalesTabs />`. Logic nghiệp vụ trả hàng sẽ phát triển sau (ngoài phạm vi turn này).

### 4. Không đụng
- Backend / server functions
- Logic của các page hiện có (chỉ thêm `<SalesTabs />` ở trên cùng)
- Route `/receipts` vẫn còn (chỉ ẩn khỏi sidebar)

## Ghi chú
- Phiếu thu được gỡ khỏi nav theo yêu cầu. Nếu sau này cần truy cập, sẽ đưa vào bên trong tab "Công nợ phải thu" hoặc trang Tổng quan bán hàng.
- "Hàng bán bị trả lại" hiện chưa có schema/UI — đợt này chỉ tạo khung tab + trang trống.
