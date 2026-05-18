
## Mục tiêu
Sắp xếp lại sidebar theo bố cục mới, tạo các route placeholder còn thiếu, bổ sung link Thuế & Báo cáo trong header.

## 1. Sidebar (`src/components/app-sidebar.tsx`)

Cập nhật mảng `SECTIONS`:

**Tổng quan** (không tiêu đề) — giữ nguyên
- Tổng quan → `/dashboard`
- Trợ lý AI → `/chat`

**Vận hành** (đổi từ "Bán hàng & Kho")
- Tiền & Ngân hàng (group)
  - Quỹ tiền mặt → `/cash`
  - Đối soát ngân hàng → `/bank`
- Bán hàng (group)
  - Tổng quan → `/sales-dashboard`
  - Đơn đặt hàng → `/sales/orders` *(placeholder mới)*
  - Phiếu bán hàng → `/sales`
  - Hoá đơn bán → `/invoices`
  - Phiếu thu → `/receipts`
  - Công nợ phải thu → `/receivables`
- Mua hàng (group)
  - Tổng quan → `/purchases`
  - Công nợ phải trả → `/payables`
- Đối tác (group)
  - Khách hàng → `/customers`
  - Nhà cung cấp → `/suppliers`
- Hàng hoá & Dịch vụ → `/inventory`
- Kho → `/inventory/movements`

**Kế toán**
- Tài sản cố định → `/assets`
- Tài sản phân bổ → `/assets/allocations` *(placeholder mới)*
- Phiếu kế toán → `/journal`
- Tiền lương → `/payroll`
- Hệ thống tài khoản → `/coa`

**Thuế** (mới)
- Thuế GTGT → `/tax/gtgt`
- Thuế TNCN → `/tax/tncn`
- Thuế TNDN → `/tax/tndn`

**Báo cáo** — giữ nguyên (`/reports`, `/reports/ledgers`)

**Hệ thống** — giữ nguyên (`/admin`, `/settings`, + `/superadmin` nếu superadmin)

## 2. Route placeholder mới

Tạo 5 file route tối thiểu (header + mô tả "Tính năng đang phát triển"):

- `src/routes/_app/sales/orders.tsx` → /sales/orders
- `src/routes/_app/assets/allocations.tsx` → /assets/allocations
- `src/routes/_app/tax/gtgt.tsx` → /tax/gtgt
- `src/routes/_app/tax/tncn.tsx` → /tax/tncn
- `src/routes/_app/tax/tndn.tsx` → /tax/tndn

Mỗi file dùng `createFileRoute(...)` với component đơn giản (tiêu đề + đoạn mô tả), tái sử dụng layout `_app`. Không cần loader hay backend.

## 3. Header (`src/components/app-header.tsx`)

Thêm 2 link nhanh **Thuế** (`/tax/gtgt`) và **Báo cáo** (`/reports`) trong nhóm action, ẩn trên mobile (`hidden md:inline-flex`), dùng `Link` của `@tanstack/react-router` với `activeProps` để highlight.

## Phạm vi không thay đổi
- Không sửa logic, backend, RLS hay DB.
- Không động đến các trang hiện có; chỉ thêm 5 placeholder.
- `routeTree.gen.ts` sẽ được Vite plugin tự sinh lại.
