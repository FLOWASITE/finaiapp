## Mục tiêu
Chuẩn hoá empty states toàn app: Fin mascot lớn + tiêu đề + mô tả + 1 CTA chuẩn của trang. Đồng bộ giọng văn (Tiếng Việt, ấm áp, ngắn gọn).

## 1. Component `<EmptyState>` (mới)
File: `src/components/ui/empty-state.tsx`

```tsx
type Props = {
  title: string;
  description?: string;
  cta?: React.ReactNode;        // 1 nút chính
  secondary?: React.ReactNode;  // tuỳ chọn (link "Tìm hiểu thêm")
  mood?: "idle" | "happy" | "thinking"; // default "idle"
  className?: string;
};
```
Layout: căn giữa, padding rộng (py-12 px-6), FinMascot `size="xl"` ở trên, tiêu đề `text-lg font-semibold`, mô tả `text-sm text-muted-foreground max-w-md`, CTA dưới cùng. Border `border-dashed` + bo `rounded-xl` + bg `bg-muted/20` để phân biệt với content. Có animation fade-in nhẹ.

## 2. Sweep áp dụng (ưu tiên list/table chính)
Thay các "Chưa có … / Không có … / trống" hiện có bằng `<EmptyState>`:

- **Dashboard** (`src/routes/_app/dashboard.tsx`) — xoá `EmptyState` local, dùng component chung (giữ size compact bằng prop `mood="idle"` + Fin nhỏ trong widget — xem ghi chú dưới).
- **Inbox AI** (`src/routes/_app/inbox.tsx`)
- **Documents** (`src/routes/_app/documents/index.tsx`)
- **E-invoices**: `einvoices/index.tsx`, `einvoices/inbox.tsx`
- **Invoices** (`src/routes/_app/invoices/index.tsx`)
- **Bank**: `bank.vouchers.tsx`, `bank.accounts.tsx`, `bank.book.tsx`, `bank.reconcile.tsx`, `bank.import-statement.tsx`
- **Cash** (`cash/index.tsx`)
- **Sales**: `sales/index.tsx`, `sales/orders.tsx`, `sales/vouchers.tsx`
- **Purchases**: `purchases/index.tsx`, `purchases/vouchers.tsx`
- **Items**: `items/index.tsx`, `items/units.tsx`, `items/categories.tsx`
- **Inventory**: `inventory/index.tsx`, `inventory/transfers.tsx`, `inventory/warehouses.tsx`, `inventory/unposted.tsx`, `VoucherListPage`
- **Assets**: `assets/index.tsx`, `assets/inventory.tsx`, `assets/depreciation.tsx`, `assets/disposal.tsx`, `assets/allocations.tsx`
- **Tax** (`tax/index.tsx`)
- **Reports** (các trang `reports/*` đang hiện "không có dữ liệu")
- **Office**: `clients`, `contracts`, `staff`, `tasks`, `templates`, `prospects` (list trống)
- **Admin/Superadmin**: list trống cơ bản (members, audit, jobs, backups…)
- **Parties** (`party-groups-page`, `party-list-enhanced` khi rỗng)
- **Chat**: empty thread list trong `thread-list.tsx` (đã có riêng — chỉ thay bằng EmptyState compact)

Cho mỗi nơi: giữ nguyên CTA cũ (nút "Thêm…", "Tạo…", "Kết nối…") truyền vào prop `cta`. Không thêm CTA AI.

## 3. Biến thể compact cho widget nhỏ
Component nhận `mood`/className để dashboard widgets có thể giảm padding (vd. `className="py-6"` + Fin nhỏ hơn qua prop `size`). Thêm prop `size?: "sm" | "lg"` (default `"lg"`):
- `lg`: FinMascot `xl`, dùng cho trang full
- `sm`: FinMascot `md`, padding nhỏ, dùng cho widget dashboard / panel

## 4. Giọng văn (rule chung)
- Tiêu đề: ngắn, mô tả tình trạng. VD "Chưa có hoá đơn nào", "Hộp thư AI trống", "Chưa kết nối ngân hàng".
- Mô tả: 1 câu giải thích bước tiếp. VD "Tạo hoá đơn đầu tiên để Fin bắt đầu hạch toán giúp bạn."
- CTA: động từ chính, khớp với nút sẵn có.

## 5. Kiểm tra
- Build pass.
- Chụp screenshot vài trang tiêu biểu khi rỗng (Inbox, Documents, Invoices, Bank vouchers) để verify layout không bị lệch khi nhúng trong Card/Table.
- Verify dashboard widgets vẫn vừa khung (dùng size="sm").

## Lưu ý kỹ thuật
- Không đụng tới error/loading state (chỉ empty).
- Một số bảng dùng `<TableRow><TableCell colSpan={N}>` cho row "không có dữ liệu" — bọc `<EmptyState size="sm">` bên trong cell, giữ colSpan.
- Trang nào thực sự không có CTA hợp lý (vd. reports filter ra rỗng) thì để CTA = `null`, hiển thị mỗi mascot + text.