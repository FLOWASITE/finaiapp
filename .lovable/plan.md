## Mục tiêu

Làm lại UI **danh sách** trang `/purchases/vouchers` (Phiếu mua hàng) theo bố cục trong ảnh, lấy `/sales/vouchers` làm khuôn mẫu. Không đổi logic backend, không động vào form Tạo/Sửa phiếu (Dialog hiện tại giữ nguyên).

## Phạm vi (chỉ frontend)

- File chỉnh: `src/routes/_app/purchases/vouchers.tsx` (phần render danh sách — khoảng dòng 300–436).
- Không sửa: `purchase-vouchers.functions.ts`, `CreateVoucherDialog`, các route khác.

## Bố cục mới (4 khối, theo ảnh)

### 1. Thanh tab điều hướng (trên cùng)
`Đơn đặt hàng | Phiếu mua hàng | Hoá đơn | Phiếu nhập kho | Trả lại hàng mua`
- Dùng `Link` của TanStack Router. Tab đang hoạt động: **Phiếu mua hàng**.
- Các tab khác trỏ tới route tương ứng nếu đã tồn tại; tab chưa có route hiển thị disable + tooltip "Sắp có" (không tạo route mới).

### 2. KPI strip (4 thẻ)
Tính từ `rows` ở client (giống `kpi` trong `sales/vouchers.tsx`):
- **Chưa xuất hoá đơn** — đếm phiếu chưa có `invoice_id`.
- **Doanh thu trong năm** (đổi nhãn cho mua hàng: *"Giá trị mua trong kỳ"*) — tổng `total` các phiếu không huỷ trong filter.
- **Đã thanh toán** — tổng `paid_amount`.
- **Tổng nợ phải trả** — tổng `max(0, total − paid_amount)`.
- Tái dùng helper `KpiCard` + `StatusDot` (copy nội bộ hoặc tách dùng chung; ưu tiên copy nội bộ trong file để giữ scope nhỏ).

### 3. Toolbar
Một hàng gồm:
- Chip ngày: `Từ {from} đến {to}` (mở Popover chọn khoảng — dùng `Input[type=date]` đơn giản như sales).
- Bộ lọc trạng thái + ô tìm kiếm (giữ logic `search`, `status` hiện có).
- Cụm nút bên phải: **Thanh toán nhanh** (disabled nếu chưa chọn dòng), **Phiếu đã chọn ({n})** dropdown (Xoá/Ghi sổ/Huỷ hàng loạt), **Phiếu MH trong nước** (= nút "Tạo phiếu mới" hiện tại, kèm dropdown caret như sales), nút ⚙ cấu hình cột (placeholder), và `Tổng: {rows.length}`.

### 4. Bảng dữ liệu
Cột (theo ảnh, dùng đúng các trường đã có từ `listPurchaseVouchers`):

| # | Cột | Nguồn |
|---|---|---|
| ☐ | Checkbox chọn dòng | local `selected: Set<string>` |
| STT | index+1 | |
| Ngày chứng từ | `voucher_date` | |
| Số chứng từ | `voucher_no` | |
| Số hoá đơn | `invoice_no` (từ join invoices nếu có; fallback "—") | |
| Ký hiệu | `invoice_series` (fallback "—") | |
| Nhà cung cấp* | `supplier_name` | |
| Mô tả* | `reason` | |
| Loại | "Trong nước" (cố định) | |
| Chi nhánh | `branch_name` (fallback "—") | |
| Chi phí MH | dot ✓/✗ theo `is_purchase_cost` | |
| Phiếu nhập kho | `stock_voucher_no` (fallback "—") | |
| Ngày HĐ | `invoice_date` nếu có | |
| TT nhập kho | dot theo `stock_voucher_id` | |
| Trạng thái | badge/dot theo `status` (`posted`/`void`/draft) | |
| Giá trị đơn hàng | `total` (right-aligned, tabular-nums) | |
| Chiết khấu | `discount_amount` | |
| Đã thanh toán | `paid_amount` (xanh nếu >0) | |
| Còn phải trả | `total - paid_amount` (đỏ nếu >0) | |
| Tài liệu | icon 📎 nếu `invoice_id` | |
| TT thanh toán | 2 nút tròn nhỏ: tiền mặt / ngân hàng (mở dialog thu/chi nhanh) — nếu đã thanh toán đủ thì hiện dot ✓ | |
| ⋯ | DropdownMenu hành động (Sửa / Ghi sổ / Huỷ / Xoá / Xem bút toán) | |

- Hàng cao 40px, font 13px (`text-[13px]`), sticky header `bg-muted/40`, hover `bg-accent/60`.
- Click dòng (trừ checkbox / cụm action) mở dialog edit hiện có.
- Trường nào backend chưa trả thì hiển thị "—"; không thêm migration/đổi server fn trong lần này.

### Thanh toán nhanh
- Nút tiền mặt/ngân hàng trên mỗi dòng và nút "Thanh toán nhanh" trên toolbar đều mở **Dialog thu/chi nhanh** (chỉ frontend stub gọi mutation hiện có nếu tương thích, nếu không có thì hiển thị `toast.info("Đang phát triển")` — tránh thay đổi backend).

## Cấu trúc kỹ thuật

- Giữ nguyên các `useQuery`, `useMutation`, `useServerFn` đã có.
- Thêm state: `selected: Set<string>`, `fFrom`, `fTo` (mặc định đầu năm → hôm nay).
- Filter client-side bổ sung theo `fFrom`/`fTo` trên `rows` nếu server chưa nhận tham số này.
- Tách 2 helper component nội bộ trong file: `KpiCard`, `StatusDot` (sao chép từ `sales/vouchers.tsx`).
- Đảm bảo `Checkbox`, `DropdownMenu`, `Popover` đã import (bổ sung nếu thiếu).

## Ngoài phạm vi (sẽ làm sau nếu cần)

- Filter row dưới mỗi header cột (ô "Tìm kiếm" per-column trong ảnh) — giữ chỗ bằng UI hiện tại, có thể thêm sau.
- Sort menu (≡) mỗi cột — sau.
- Resize/hide cột (nút ⚙) — sau.
- Tạo route mới cho các tab "Đơn đặt hàng / Hoá đơn / Phiếu nhập kho / Trả lại hàng mua".
- Thay đổi backend / migration.

## Verify

- Build/typecheck pass.
- Mở `/purchases/vouchers` đối chiếu trực quan với `/sales/vouchers` (cùng pattern KPI + table).
- Test: tạo phiếu mới (dialog cũ vẫn hoạt động), checkbox chọn dòng, nút ⋯ ghi sổ/huỷ/xoá, dot trạng thái đúng.
