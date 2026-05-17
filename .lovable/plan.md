## Mục tiêu
Tối ưu responsive cho Phân hệ Bán hàng (`/sales` và `/sales/$id`) để dùng mượt trên mobile (≤640px), tablet (641–1024px), desktop (>1024px). Chỉ chỉnh UI/presentation, không đụng business logic & server functions.

## Vấn đề hiện tại (ở viewport ~707px)
- Padding trang `p-8` quá rộng trên mobile.
- Header (`flex justify-between`) không xuống dòng → nút action tràn.
- Money strip `md:grid-cols-4` → mobile 1 cột, dài lê thê (4 card xếp dọc).
- "Mini KPI" 30/60/90 ngày cũng 1 cột dọc trên mobile.
- Charts `h-64` cố định, label/legend chen chúc trên màn nhỏ.
- Tabs có icon + text dài, dễ tràn ngang ở mobile.
- **Bảng dữ liệu** (Invoices/Receipts/Overdue/Top customers) chỉ `overflow-x-auto` → cuộn ngang dài, khó đọc.
- Filter bar receipts (date + select + search + 2 button) dồn 1 hàng → vỡ layout.
- Trang chi tiết `/sales/$id`: bảng dòng hàng + side panel chưa stack tốt.

## Phạm vi
1. `src/routes/_app/sales/index.tsx` — Hub + 4 tab
2. `src/routes/_app/sales/$id.tsx` — Chi tiết hoá đơn (kiểm tra & chỉnh nếu cần)

Không đổi: server functions, schema, routing, navigation.

## Thay đổi cụ thể

### A. Layout chung
- `p-8` → `p-4 sm:p-6 lg:p-8`; `space-y-6` → `space-y-4 sm:space-y-6`.
- Header: `flex-col sm:flex-row sm:items-center sm:justify-between`, nút action `w-full sm:w-auto`, gom trong `flex flex-wrap gap-2`.

### B. Money strip & Mini KPI
- Money strip: `grid-cols-2 md:grid-cols-4` (mobile 2×2 thay vì 1×4).
- Mini KPI 30/60/90: `grid-cols-3` ngay từ mobile (số nhỏ, vẫn vừa); giảm padding card.
- `MoneyCard`: giảm font value `text-xl sm:text-2xl`, padding `p-3 sm:p-4`.

### C. Charts
- Grid `grid-cols-1 lg:grid-cols-3` (giữ), nhưng giảm chiều cao mobile: `h-56 sm:h-64`.
- Pie chart: `innerRadius`/`outerRadius` responsive (dùng `%` hoặc giảm ở mobile).
- Ẩn `Legend` trên mobile (hoặc dùng `iconSize` nhỏ).

### D. Tabs
- `TabsList` cho phép wrap: `flex-wrap h-auto`; hoặc cuộn ngang `overflow-x-auto`.
- Mobile: ẩn text, chỉ icon — `<span className="hidden sm:inline">…</span>`.

### E. Bảng dữ liệu — pattern responsive
Áp dụng cho cả 4 bảng (Invoices, Receipts, Overdue, Top customers):
- **Desktop (≥md)**: giữ `<table>` hiện tại.
- **Mobile (<md)**: render danh sách **card stack** thay cho bảng — mỗi dòng thành 1 card gọn:
  - Dòng 1: số HĐ + badge trạng thái
  - Dòng 2: khách hàng
  - Dòng 3: ngày, hạn TT, tổng/còn lại (key-value 2 cột)
  - Dòng 4: nút "Thu"/xoá
- Dùng `<div className="md:hidden">…cards…</div>` + `<div className="hidden md:block">…table…</div>` (chia sẻ cùng data, không fetch lại).

### F. Filter bar (Receipts)
- Đổi `flex flex-wrap` → `grid grid-cols-2 sm:grid-cols-4 lg:flex lg:flex-wrap items-end gap-3`.
- Date inputs `w-full sm:w-40`; search ô riêng 1 hàng full width trên mobile.
- 2 nút (CSV, Tạo phiếu thu) `col-span-2 sm:col-span-4 lg:w-auto` + `flex gap-2 justify-end`.

### G. Trang `/sales/$id`
- Header chi tiết: stack dọc trên mobile.
- Bảng dòng hàng: ẩn cột phụ (VAT code, mô tả dài) trên mobile bằng `hidden sm:table-cell`.
- Side panel (totals/customer): `grid-cols-1 lg:grid-cols-3` thay vì luôn 3 cột.

## Out of scope
- Không thay đổi server functions, query keys, schema.
- Không đổi design tokens / màu sắc.
- Không touch các trang ngoài `/sales`.

## QA checklist sau khi build
- 360px (mobile): header không tràn, money strip 2×2, tabs cuộn/icon-only, mỗi dòng bảng là 1 card.
- 768px (tablet): money strip 4 cột, tabs hiện đầy đủ, bảng dạng table với scroll ngang nhẹ.
- 1280px (desktop): layout y như hiện tại, không regression.
