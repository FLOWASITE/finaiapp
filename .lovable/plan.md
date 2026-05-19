
# Đơn đặt hàng bán (Sales Orders) — Kế hoạch triển khai

Hiện trạng: route `/_app/sales/orders` mới là placeholder. Bảng `sales_invoices` đã có cột `sales_order_id` (sẵn sàng liên kết), nhưng **chưa có bảng `sales_orders`**. Cần dựng module chuẩn: nhập đơn → duyệt → giao hàng/xuất hoá đơn → đóng đơn.

## 1. Phạm vi nghiệp vụ

- Một **Đơn đặt hàng (SO)** = cam kết bán hàng với khách trước khi xuất hoá đơn / phiếu xuất kho.
- **Không sinh bút toán** (off-balance) — chỉ là chứng từ thương mại. Đúng chuẩn VN: SO không vào sổ kế toán, chỉ là cơ sở để xuất HĐ bán.
- Vòng đời: `draft` → `confirmed` → `partial` / `fulfilled` → `closed` (hoặc `cancelled`).
- Cho phép **xuất 1 SO thành nhiều HĐ bán** (giao nhiều đợt). Theo dõi % đã giao theo dòng.

## 2. Cấu trúc dữ liệu

### Bảng `sales_orders` (header)
- `order_no` (auto, prefix `DH{YYYYMM}/00001` — thêm `sale_order` vào `codegen.functions.ts`)
- `customer_id`, `customer_name`, `customer_tax_id`, `ship_address`
- `order_date`, `expected_delivery_date`, `valid_until`
- `currency` (mặc định VND), `exchange_rate`
- `subtotal`, `discount_amount`, `vat_amount`, `total`
- `status`: `draft | confirmed | partial | fulfilled | closed | cancelled`
- `payment_terms_days`, `notes`, `internal_notes`
- Chiều phân tích: `branch_id`, `department_id`, `project_id`, `cost_center_id`, `salesperson_id`
- Audit: `user_id`, `tenant_id`, `created_at`, `updated_at`, `confirmed_at`, `confirmed_by`, `closed_at`

### Bảng `sales_order_lines`
- `order_id`, `line_no`, `product_id`, `description`
- `qty_ordered`, `qty_delivered` (tự tăng khi HĐ liên kết), `qty_remaining` (computed)
- `unit`, `unit_price`, `discount_pct`, `discount_amount`
- `vat_rate`, `vat_amount`, `amount`, `line_total`
- `warehouse_id` (gợi ý kho xuất), `notes`

### Liên kết HĐ bán
- Đã có `sales_invoices.sales_order_id`. Thêm `sales_invoice_lines.sales_order_line_id` để cộng dồn `qty_delivered`.
- Trigger: khi insert/update/delete `sales_invoice_lines` có `sales_order_line_id` → tính lại `qty_delivered` của line và đẩy status header (`partial` nếu một phần, `fulfilled` nếu đủ tất cả lines).

### RLS
- Theo pattern hiện có: tenant-aware (`tenant_id = active_tenant_id` của user), hoặc `user_id = auth.uid()` khi chưa có tenant. Đầy đủ SELECT/INSERT/UPDATE/DELETE policies.

## 3. Server functions (`src/lib/sales-orders.functions.ts`)

- `listSalesOrders({ customerId?, status?, fromDate?, toDate?, search? })` — kèm tổng & % giao hàng.
- `getSalesOrder({ id })` — header + lines + danh sách HĐ đã xuất từ SO.
- `upsertSalesOrder(input)` — Zod validate; auto code khi tạo mới qua `nextEntityCode("sale_order")`.
- `confirmSalesOrder({ id })` — chuyển `draft → confirmed`, chặn sửa lines.
- `cancelSalesOrder({ id, reason })` — chỉ cho phép khi chưa có HĐ liên kết.
- `closeSalesOrder({ id })` — đóng thủ công kể cả chưa giao đủ.
- `createInvoiceFromOrder({ orderId, lineSelections: [{lineId, qty}] })` — tạo HĐ bán nháp từ SO (gọi lại `upsertSalesInvoice`), set `sales_order_id` + `sales_order_line_id` từng dòng.
- `salesOrderStats({ fromDate, toDate })` — KPI cho dashboard nhỏ trên trang Orders.

Tất cả dùng `requireSupabaseAuth`. Không tạo voucher / journal lines.

## 4. UI — `src/routes/_app/sales/orders.tsx`

Layout tương tự `/sales` index nhưng gọn hơn:

- **KPI strip**: Tổng SO trong kỳ, Giá trị cam kết, Đã giao, Còn lại, Tỷ lệ hoàn thành.
- **Toolbar**: tìm theo số/khách, lọc trạng thái + khoảng ngày, nút "Đơn mới".
- **Bảng SO**: số DH, ngày, khách, giá trị, % đã giao (progress bar), trạng thái (`DocStatusBadge`), action menu (Xem / Duyệt / Tạo HĐ / Huỷ / In).
- **Dialog Đơn mới / sửa** (responsive như `/sales` invoice):
  - Header: `CustomerCombobox`, ngày đặt, ngày giao dự kiến, hiệu lực, NV bán hàng, chi nhánh/phòng ban/dự án (dùng `dimension-pickers`).
  - Lines: bảng desktop + card mobile (`md:hidden`), mỗi dòng: sản phẩm, SL, ĐVT, đơn giá, % CK, % VAT, thành tiền. Auto tính.
  - Footer: tổng tiền hàng / CK / VAT / Tổng.
  - Nút: Lưu nháp / Lưu & Duyệt.
- **Trang chi tiết `/sales/orders/$id`**: thông tin SO + tab "Hoá đơn đã xuất" + nút **"Tạo hoá đơn từ đơn"** (mở dialog chọn dòng + số lượng còn lại).
- **In phiếu**: `/sales/orders/$id/print` — A4 đơn giản, có logo tenant, chữ ký 2 bên.

Mọi ô **tài khoản** (nếu có ở dòng, ví dụ TK doanh thu mặc định) dùng `AccountCombobox` chuẩn hệ thống. Mọi field code dùng `nextEntityCode` server-side, không cho user gõ tay (theo memory ngầm từ các phân hệ khác).

## 5. Tích hợp với hoá đơn bán hiện có

- Trong form `Hoá đơn bán` (`/sales`): thêm ô chọn **Đơn đặt hàng nguồn** (optional). Khi chọn → tự fill khách + lines còn lại; user điều chỉnh SL giao đợt này.
- Trang `/sales/$id`: hiển thị link ngược về SO nếu có.
- Khi HĐ bán bị huỷ/xoá → trigger giảm `qty_delivered` tương ứng.

## 6. Cập nhật điều hướng

- Sidebar mục "Bán hàng" đã có "Đơn đặt hàng" → trỏ tới route mới (giữ nguyên path `/sales/orders`).
- Thêm 2 route con: `sales/orders.$id.tsx`, `sales/orders.$id.print.tsx`.

## 7. Thứ tự thi hành

1. **Migration**: tạo `sales_orders`, `sales_order_lines`, RLS, trigger cập nhật `qty_delivered`, thêm `sales_invoice_lines.sales_order_line_id`.
2. Bổ sung `sale_order` vào `codegen.functions.ts` (prefix `DH`, date-scoped, padLen 5).
3. Viết `sales-orders.functions.ts` đầy đủ + Zod schema.
4. Thay placeholder `orders.tsx` bằng UI đầy đủ; tạo route chi tiết + in.
5. Patch form hoá đơn bán: chọn SO nguồn, gửi kèm `sales_order_line_id` cho từng dòng.
6. Smoke test: tạo SO → duyệt → xuất 1 phần → kiểm tra `qty_delivered`, status `partial` → xuất nốt → `fulfilled`.

## 8. Câu hỏi xác nhận

1. **Phê duyệt nhiều cấp** cho SO (vd: SO > X tỷ cần cấp trên duyệt) — có cần ngay đợt này hay để sau?
2. **Đặt cọc / tạm ứng** theo SO (gắn phiếu thu tạm ứng vào SO) — làm ngay hay tách module riêng?
3. **Giữ tồn kho** (reserve stock) khi `confirmed` — có muốn không? Nếu có sẽ cần thêm bảng `stock_reservations`.
4. **Đơn vị tiền tệ ngoại tệ** + tỉ giá — chỉ VND trước hay multi-currency luôn?

Mặc định nếu không trả lời: **(1) 1 cấp duyệt, (2) chưa làm tạm ứng, (3) không reserve stock, (4) VND only** — đủ chuẩn cho phần lớn DN VN, mở rộng sau dễ.
