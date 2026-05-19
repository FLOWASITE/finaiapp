
# Đặt cọc (Deposit) & Reserve tồn kho cho Đơn đặt hàng — tuỳ chọn

Hai nghiệp vụ độc lập, có thể bật/tắt theo từng đơn. Không bắt buộc, không phá vỡ luồng SO hiện tại.

## 1. Cấu hình bật/tắt

Thêm 2 cờ vào `sales_orders`:
- `deposit_enabled boolean default false` — bật quản lý đặt cọc cho SO
- `reserve_enabled boolean default false` — bật giữ kho khi confirm

Trên form Đơn đặt hàng: 2 toggle "Yêu cầu đặt cọc" và "Giữ tồn kho khi xác nhận". Mặc định tắt — toàn bộ SO cũ và đơn không cần 2 nghiệp vụ này hoạt động y nguyên.

## 2. Nghiệp vụ Đặt cọc (Deposit)

### Trường mới trên `sales_orders`
- `deposit_required numeric default 0` — số tiền cọc yêu cầu
- `deposit_percent numeric` — % theo tổng đơn (tuỳ chọn, dùng để gợi ý số tiền)
- `deposit_due_date date` — hạn nộp cọc
- `deposit_received numeric default 0` — tổng đã thu (auto từ trigger)
- `deposit_status text` — `none | pending | partial | received | refunded` (auto)

### Bảng mới `sales_order_deposits`
Lưu các phiếu thu cọc gắn với SO (tách biệt với `customer_receipts` thu tiền hóa đơn):
- `order_id`, `tenant_id`, `user_id`
- `deposit_no` (auto, prefix `DC{YYYYMM}/`)
- `pay_date`, `amount`, `method` (cash/bank), `reference`
- `cash_account` / `bank_account` (dùng `AccountCombobox`)
- `customer_advance_account` mặc định `131` hoặc `3387` (Doanh thu chưa thực hiện) — cho user chọn, lưu mặc định ở tenant
- `status` (`uploaded|posted|void`), `journal_entry_id`, `notes`
- `applied_to_invoice_id` — khi cọc được cấn trừ vào hóa đơn

### Hạch toán
- Khi POST phiếu cọc → tạo `journal_entry`:
  - Nợ 111/112 (tài khoản tiền)
  - Có 131 hoặc 3387 (tuỳ chọn) — kê chi tiết theo `customer_id`
- Khi cấn vào hoá đơn (action "Cấn cọc vào HĐ"):
  - Nợ 131 (công nợ KH HĐ) / Có 131 (theo dõi cọc)
  - Hoặc dùng `customer_receipts` chuyên biệt liên kết invoice_id, mark `source='deposit_apply'`

### Trigger & quy tắc
- Trigger `tg_so_deposits_refresh` → tính `deposit_received` + `deposit_status` cho SO
- Khi `confirm` SO mà `deposit_enabled=true` và `deposit_required>0` và `deposit_received < deposit_required` → cảnh báo (không chặn cứng, owner có thể override với lý do)
- Khi `cancel` SO mà còn cọc chưa cấn → yêu cầu chọn: hoàn cọc (tạo phiếu chi đối ứng) hoặc giữ cọc (ghi nhận khoản phạt — hạch toán thu nhập khác)

## 3. Nghiệp vụ Reserve tồn kho

Reserve là **giữ chỗ logic**, KHÔNG tạo `stock_movements` thật (tồn vật lý không đổi, chỉ giảm tồn khả dụng).

### Bảng mới `stock_reservations`
- `tenant_id`, `product_id`, `warehouse_id`
- `ref_type` text default `'sales_order'`, `ref_id uuid` (= sales_order_line.id)
- `qty_reserved numeric` — số lượng đang giữ
- `qty_released numeric default 0` — đã giải phóng (do giao hàng / cancel)
- `status` (`active|released|cancelled`)
- `reserved_at`, `released_at`, `expires_at` (= `valid_until` của SO, nếu có)
- Unique `(ref_type, ref_id)`

### Quy ước "Tồn khả dụng"
```
available_qty = on_hand - SUM(stock_reservations.qty_reserved - qty_released WHERE active)
```
Thêm helper view/RPC `product_stock_availability(product_id, warehouse_id)`.

### Vòng đời reservation
- **Confirm SO** (`status: draft → confirmed`) với `reserve_enabled=true`:
  - Với mỗi line có `product_id` + `warehouse_id`: kiểm tra `available_qty >= qty_ordered`.
    - Đủ → tạo `stock_reservations` (qty=qty_ordered)
    - Không đủ → trả lỗi liệt kê SP thiếu; cho phép "Confirm + giữ phần có" (partial reserve) qua flag.
- **Tạo Hoá đơn từ SO** (giao hàng): khi `sales_invoice_lines` gắn `sales_order_line_id` và HĐ post → tự release tương ứng (`qty_released += delivered_qty`) qua mở rộng trigger `tg_sil_refresh_so_progress`.
- **Cancel/Close SO** → release toàn bộ reservation còn active.
- **Sửa qty_ordered** ở SO confirmed → điều chỉnh `qty_reserved` (tăng cần check availability, giảm thì release).
- **Expire** (nếu `expires_at < today` và còn active) → job/manual: chuyển status `expired`, release.

### UI hiển thị
- Trang chi tiết SO: thêm card "Giữ kho" — bảng line × (đặt / đã giao / đang giữ / khả dụng kho), badge ⚠ nếu reserve thiếu.
- Form Hoá đơn bán hàng: khi chọn SP có reservation từ SO khác → cảnh báo "Đang giữ X cho SO …".
- Báo cáo: thêm `/inventory/availability` (Tồn vật lý / Đang giữ / Khả dụng) — tuỳ chọn (giai đoạn 2).

## 4. Server functions mới (`src/lib/sales-orders.functions.ts` + `deposits.functions.ts` mới)

- `listSalesOrderDeposits(orderId)`
- `upsertSalesOrderDeposit(input)` — tạo/sửa phiếu cọc (draft)
- `postSalesOrderDeposit(id)` — sinh journal entry
- `voidSalesOrderDeposit(id, reason)`
- `applyDepositToInvoice({ depositId, invoiceId, amount })`
- `refundDeposit({ orderId, amount, method, ... })`
- Mở rộng `confirmSalesOrder({ id, allowPartialReserve? })` — chạy reserve khi flag bật
- `releaseReservations(orderId)` — dùng nội bộ + action thủ công
- `getStockAvailability({ productId, warehouseId })`

## 5. Codegen

`src/lib/codegen.functions.ts`: thêm `deposit` → prefix `DC{YYYYMM}/00001`.

## 6. Migration order

1. ALTER `sales_orders` thêm các cờ + trường deposit
2. CREATE `sales_order_deposits` + RLS (tenant scope, role `owner/admin/accountant/sales`)
3. CREATE `stock_reservations` + RLS + index `(product_id, warehouse_id, status)`
4. Trigger: `tg_so_deposits_refresh`, mở rộng `tg_sil_refresh_so_progress` để release reservation, `tg_so_status_release_reservations` (khi cancel/close)
5. Helper SQL: `fn_product_available_qty(...)`

## 7. Câu hỏi cần xác nhận trước khi code

1. **TK cọc mặc định**: dùng `131 - Phải thu KH` (theo dõi như công nợ âm) hay `3387 - Doanh thu chưa thực hiện` / `131x` chi tiết? Đề xuất: cho cấu hình ở tenant, mặc định `131` chi tiết "cọc KH".
2. **Reserve partial**: cho phép confirm SO khi tồn không đủ (giữ phần có, phần còn lại = backorder) hay chặn cứng? Đề xuất: cho phép, có cảnh báo.
3. **Reserve theo kho**: bắt buộc line phải có `warehouse_id` mới reserve được — line không có kho bỏ qua. OK?
4. **Phạm vi hiển thị**: chỉ làm trong module SO + form HĐ bán, hay làm luôn báo cáo "Tồn khả dụng" (giai đoạn sau)?

## Phạm vi file dự kiến

- Migration mới (1 file)
- `src/lib/codegen.functions.ts` (+ deposit)
- `src/lib/sales-orders.functions.ts` (mở rộng confirm/cancel)
- `src/lib/deposits.functions.ts` (mới)
- `src/lib/inventory.functions.ts` (thêm availability)
- `src/routes/_app/sales/orders.$id.tsx` (UI card cọc + reserve)
- `src/routes/_app/sales/orders.tsx` (toggle trong form)
- `src/integrations/supabase/types.ts` (auto-regenerate)

Sau khi bạn duyệt và trả lời 4 câu hỏi trên, tôi sẽ chạy migration + code theo thứ tự.
