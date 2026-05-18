
# Hoàn thiện liên kết HĐĐT ↔ Hoá đơn nội bộ

Hiện trạng: đã có `linkEInvoice` (gắn `matched_*_id`) và `createPurchaseFromEInvoice` (tạo mới phiếu mua từ HĐĐT đầu vào). Còn thiếu: link/unlink với HĐ có sẵn ở cả 2 chiều, hiển thị chiều ngược, và auto-match hàng loạt.

## Phạm vi

### 1. Liên kết thủ công ở trang chi tiết HĐĐT (`/einvoices/$id`)

- Khi **chưa** liên kết → hiện nút **Liên kết với HĐ có sẵn** (cả `in` lẫn `out`), mở dialog với combobox tìm kiếm:
  - `in` → tìm trong `invoices` (lọc theo `supplier_tax_id` = seller, gợi ý ưu tiên trùng `invoice_no`, sắp xếp theo độ khớp).
  - `out` → tìm trong `sales_invoices` (lọc theo `customer.tax_id` = buyer, ưu tiên trùng `invoice_no`).
  - Hiển thị: số HĐ · ngày · đối tác · tổng tiền; có cảnh báo nếu tổng tiền lệch > 1đ.
- Khi **đã** liên kết → hiện block "Đã liên kết với …" + nút **Bỏ liên kết** (gọi `linkEInvoice` với `targetId: null`).
- Giữ nguyên nút **Tạo phiếu mua từ HĐĐT** cho chiều `in`.

### 2. Tự động ghép hàng loạt (auto-match)

- Server fn mới `autoMatchEInvoices({ direction, dateFrom?, dateTo? })`:
  - Quét các HĐĐT chưa `matched_*_id` trong khoảng ngày.
  - Match theo `(seller_tax_id, invoice_no)` ↔ `(invoices.supplier_tax_id, invoice_no)` cho `in`; tương tự với `sales_invoices` qua `customers.tax_id` + `invoice_no` cho `out`.
  - Chỉ ghép khi kết quả là 1 hàng duy nhất; bỏ qua trường hợp nhiều / không có.
  - Trả về `{ matched, skipped, ambiguous }`.
- Trang list `/einvoices`: thêm nút **Tự động ghép** (chạy theo `tab` + `dateRange` hiện tại), hiện toast kết quả + invalidate query.

### 3. Hiển thị chiều ngược

- `src/routes/_app/invoices/$id.tsx` (mua): nếu có HĐĐT trỏ tới (`einvoices.matched_purchase_invoice_id = invoice.id`), hiện badge **Đã gắn HĐĐT** + link sang `/einvoices/{id}`.
- `src/routes/_app/sales/$id.tsx` (bán): tương tự với `matched_sales_invoice_id`.
- Thêm server fn nhẹ `getLinkedEInvoice({ kind: 'in'|'out', invoiceId })` hoặc include trong loader hiện có của trang chi tiết.

### 4. Sửa chi tiết nhỏ

- `getEInvoice` trả thêm `matchedInvoice` (số HĐ + ngày + tổng) để trang chi tiết không phải fetch riêng.
- `linkEInvoice`: validate `targetId` thuộc cùng `tenant_id` và đúng bảng theo `direction` trước khi update (chống gắn nhầm).
- Thêm RLS-safe check `payment_status` không cản trở update (chỉ update cột `matched_*_id`).

## Chi tiết kỹ thuật

**File chỉnh sửa**
- `src/lib/einvoices.functions.ts`: mở rộng `linkEInvoice` (validate + trả tên HĐ), mở rộng `getEInvoice` (kèm matched preview), thêm `searchLinkableInvoices`, `autoMatchEInvoices`, `getLinkedEInvoice`.
- `src/components/link-einvoice-dialog.tsx` (mới): combobox + danh sách candidate + xác nhận.
- `src/routes/_app/einvoices/$id.tsx`: nút Liên kết / Bỏ liên kết, dùng dialog mới.
- `src/routes/_app/einvoices/index.tsx`: nút **Tự động ghép**.
- `src/routes/_app/invoices/$id.tsx`, `src/routes/_app/sales/$id.tsx`: badge + link tới HĐĐT.

**Không thay đổi**
- Schema DB giữ nguyên (đã có `matched_sales_invoice_id` / `matched_purchase_invoice_id`).
- Không động vào flow `createPurchaseFromEInvoice`.

## Câu hỏi xác nhận

1. Khi auto-match phát hiện tổng tiền lệch quá ngưỡng (vd > 1.000đ) — vẫn ghép hay bỏ qua chờ user xác nhận? Mặc định mình sẽ **vẫn ghép** nhưng cảnh báo trên UI list.
2. Có cần thêm **Tạo HĐ bán từ HĐĐT đầu ra** (đối xứng với `createPurchaseFromEInvoice`) không? Mặc định mình **không làm** trong scope này vì HĐ bán thường được tạo trước, HĐĐT về sau.
