## Mục tiêu
Áp dụng đúng chuẩn phần mềm kế toán cho trang **`/inventory/transfers` — Phiếu chuyển kho**, đồng bộ với layout đã làm cho Phiếu nhập/xuất kho (`/inventory/vouchers`).

## Phạm vi
Chỉ sửa frontend trong `src/routes/_app/inventory/transfers.tsx`. Không đổi server function, schema, business logic.

## Thay đổi

### 1. Header gọn, có toolbar hành động
- Tiêu đề + mô tả ngắn (giữ icon `ArrowRightLeft`).
- Nhóm nút bên phải: **Làm mới**, **Xuất CSV**, **Tạo phiếu chuyển kho**.
- Dùng grid responsive `grid-cols-[minmax(0,1fr)_auto]` → `sm:flex` để không vỡ ở mobile.

### 2. Toolbar lọc dạng card
1 hàng grid 12-col:
- Kỳ (DateRangeFilter) — 4 col
- Kho xuất (Select, có "Tất cả") — 2 col
- Kho nhập (Select, có "Tất cả") — 2 col
- Trạng thái (Tất cả / Đã ghi sổ / Chưa ghi sổ) — 2 col
- Tìm kiếm (số phiếu, lý do) — 2 col

### 3. KPI 1 hàng (3 thẻ)
- **Số phiếu** (icon `FileText`, tone primary)
- **Tổng số dòng** (icon `Layers`, tone emerald)
- **Tổng giá trị** (icon `Coins`, tone orange, suffix ₫)

Dùng component `Kpi` cùng style với VoucherListPage (height nhỏ, label 11px uppercase).

### 4. Bulk action bar
- Checkbox chọn từng dòng + chọn cả trang.
- Khi `selected.size > 0` hiện thanh nổi: "X phiếu đang chọn" + nút **Bỏ chọn** + **Huỷ phiếu** (AlertDialog xác nhận, gọi `cancelStockTransfer` song song).

### 5. Bảng density cao (desktop)
Sticky header, text-sm, hover, zebra nhẹ. Cột:
- Checkbox
- Ngày (tabular-nums)
- Số phiếu (mono, click mở chi tiết — tạm reuse dialog hiện có hoặc giữ inline)
- Kho xuất → mũi tên → Kho nhập (gộp 1 cột "Luồng chuyển" cho gọn, có icon ArrowRight)
- Diễn giải / Lý do (truncate)
- SL dòng (text-right)
- Tổng SL (text-right)
- Tổng giá trị (text-right, font-medium)
- Trạng thái ghi sổ (Badge "Đã ghi sổ" emerald / "Chưa ghi sổ" outline)
- Menu `⋯` (Xem, In, Huỷ)

Footer: tổng giá trị của trang hiện tại.

### 6. Mobile card view (`md:hidden`)
Mỗi phiếu render thành card:
- Dòng trên: checkbox + số phiếu (mono primary) + badge "Chuyển" + ngày
- Dòng giữa: `Kho xuất → Kho nhập` (icon ArrowRight)
- Dòng dưới: lý do (truncate) + tổng giá trị (font-semibold tabular-nums)
- Badge trạng thái ghi sổ bên trái

### 7. Phân trang + Empty/Loading
- Dùng `usePagination` + `TablePagination` (20/trang) như VoucherListPage.
- Skeleton 5 dòng khi loading.
- `EmptyState` khi không có dữ liệu, có CTA "Tạo phiếu chuyển kho".

### 8. Export CSV
Cùng pattern với VoucherListPage: BOM UTF-8, cột Ngày / Số phiếu / Kho xuất / Kho nhập / Số dòng / Tổng SL / Tổng giá trị / Lý do / Trạng thái.

### 9. Refresh tay
Nút `RefreshCw` gọi `refetch()`, spin khi `isFetching`.

## Không động vào
- `TransferFormDialog` (form tạo phiếu) — giữ nguyên.
- Server functions `listStockTransfers`, `createStockTransfer`, `cancelStockTransfer`.
- Trạng thái ghi sổ: dựa trên field hiện có (`journal_entry_id` nếu listStockTransfers trả về; nếu chưa có sẽ chỉ hiện cột nhưng để trống — không sửa BE).

## Files
- `src/routes/_app/inventory/transfers.tsx` — refactor toàn bộ phần list (giữ phần dialog tạo phiếu).

## Token & style
Dùng semantic tokens (`bg-card`, `text-primary`, `bg-muted/40`, `text-emerald-600`...). Không hardcode màu, dark mode tự chạy.
