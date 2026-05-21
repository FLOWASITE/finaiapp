## Mục tiêu
Bổ sung **Phiếu mua hàng** — chứng từ kế toán riêng để ghi nhận nghiệp vụ mua (hàng hoá / dịch vụ / chi phí). Phiếu nhập tay được, có thể link tới một Hoá đơn mua (`invoices`) đã có, và tự sinh các nghiệp vụ kéo theo.

## 1. Database (migration)

**Bảng mới `purchase_vouchers`** — theo pattern `cash_vouchers`:
- Định danh: `voucher_no`, `voucher_date`, `tenant_id`, `user_id`, các chiều phân tích (branch/department/project/cost_center).
- Liên kết: `supplier_id`, `supplier_name`, `supplier_tax_id`, `invoice_id` (FK invoices, nullable), `journal_entry_id`, `stock_voucher_id`, `cash_voucher_id`, `bank_voucher_id`.
- Nội dung: `reason` (diễn giải), `subtotal`, `vat_amount`, `total`, `vat_rate`, `currency`.
- Định khoản (form gọn): `debit_account` (mặc định 156/152/642…), `credit_account` (331/111/112), `vat_account` (mặc định 1331, nullable).
- Thanh toán: `payment_method` enum `credit` | `cash` | `bank` (mặc định `credit` = ghi 331), `payment_account` (1111/1121…), `pay_now` boolean.
- Tạo kho: `create_stock_voucher` boolean, `warehouse_id` (nullable).
- Trạng thái: `status` (uploaded/reviewed/posted/void), `posted_at`, `voided_at`, `void_reason`, `notes`.

**Bảng mới `purchase_voucher_lines`** — dùng khi link tới invoice hoặc khi chuyển sang chế độ chi tiết (đã được snapshot từ `invoice_lines` nếu link): `product_id`, `description`, `qty`, `unit_price`, `amount`, `vat_rate`, `line_type`. Ở MVP form gọn có thể chỉ có 1 dòng tổng.

**RLS & trigger**:
- RLS theo `tenant_id` (pattern hiện có) — chỉ thành viên tenant đọc/ghi; owner/admin/accountant được post & void.
- Trigger `enforce_document_status_transition` (tái dùng), `log_document_status_change`, `assert_dim_same_tenant`, `audit_trigger`.
- Trigger sau khi `posted` → đảm bảo `journal_entry_id` không null (giống invoices).

## 2. Server functions (`src/lib/purchase-vouchers.functions.ts`)

Tất cả `createServerFn` + `requireSupabaseAuth`:
- `listPurchaseVouchers({ search?, status?, from?, to?, supplierId? })` → trả về voucher + supplier + tổng tiền.
- `getPurchaseVoucher({ id })` → chi tiết + lines + JE + linked stock/cash voucher + invoice.
- `createPurchaseVoucher({ ... })` → insert header + lines; nếu `invoice_id` được chọn, snapshot lines từ `invoice_lines` và lock các trường tiền theo invoice.
- `updatePurchaseVoucher({ id, ... })` — chỉ khi `status ∈ {uploaded, reviewed}`.
- `deletePurchaseVoucher({ id })` — chỉ draft.
- `postPurchaseVoucher({ id })` — atomic:
  1. Tính bút toán theo `payment_method`:
     - `credit` (mặc định): Nợ `debit_account` (subtotal) + Nợ `vat_account` (vat) / Có 331 (total).
     - `cash` / `bank`: Nợ `debit_account` + Nợ `vat_account` / Có `payment_account` (1111/1121).
  2. Insert `journal_entries` + `journal_lines`.
  3. Nếu `create_stock_voucher` = true và có dòng hàng có `product_id` → insert `stock_vouchers` (loại nhập) + `stock_movements` theo đơn giá tính từ `amount/qty` (giống `approveJournalEntry` hiện tại); cập nhật bình quân gia quyền `products.unit_cost`.
  4. Nếu `pay_now` (cash/bank) → tạo `cash_vouchers` (type `payment`) hoặc `bank_vouchers` tương ứng, link `journal_entry_id`.
  5. Update voucher: `status='posted'`, `posted_at`, các id liên kết.
- `voidPurchaseVoucher({ id, reason })` — đảo bút toán (sinh JE đảo), huỷ stock_movements (insert dòng ngược), đặt `status='void'`.
- `stickStockVoucher({ id, warehouseId })` — nút "Stick Nhập kho" để tạo riêng phiếu nhập kho sau khi đã ghi sổ (cho trường hợp ban đầu chưa tick).

Tái dùng `is_period_locked` để chặn ghi sổ vào kỳ đã khoá.

## 3. UI

**Route mới** `src/routes/_app/purchases/vouchers.tsx` — danh sách phiếu mua (filter theo trạng thái, NCC, khoảng ngày, search số phiếu/NCC). Cột: Số phiếu, Ngày, NCC, Diễn giải, Tổng tiền, PT thanh toán, Trạng thái, Hành động.

**Route mới** `src/routes/_app/purchases/vouchers.$id.tsx` — chi tiết phiếu (xem/edit/post/void), 2 cột:
- Trái: thông tin phiếu + định khoản preview (bảng Nợ/Có với số tiền tự tính), nút In phiếu.
- Phải: nghiệp vụ liên kết (Bút toán, Phiếu nhập kho, Phiếu chi) với link nhanh; nút "Stick Nhập kho" nếu chưa có.

**Dialog/Drawer "Tạo phiếu mua hàng"** — form gọn:
- Hàng 1: Số phiếu (auto-gen `PMH-YYYYMM-####`), Ngày, NCC (combobox suppliers, tạo nhanh).
- Hàng 2: Link HĐ mua (Select rỗng hoặc gợi ý từ `invoices` cùng NCC chưa post) — chọn xong tự fill số HĐ/ngày/tổng/VAT.
- Hàng 3: Diễn giải.
- Hàng 4: Subtotal | VAT% | VAT amount | Total (auto-tính, có thể override).
- Hàng 5: TK Nợ (combobox CoA, default 156), TK Có (default 331), TK VAT (default 1331).
- Hàng 6: Phương thức TT (`credit` | `cash` | `bank`); nếu cash/bank → hiện TK tiền + checkbox "Thanh toán ngay → sinh phiếu chi/UNC".
- Hàng 7: Checkbox "Sinh phiếu nhập kho" + chọn Kho (chỉ enable khi `debit_account` thuộc nhóm 15* và có link invoice với dòng hàng có product, hoặc chế độ chi tiết sau này).
- Nút "Lưu nháp" / "Lưu & Ghi sổ".

**Tích hợp vào trang Mua hàng hiện có** (`src/routes/_app/purchases/index.tsx`):
- Thêm tab/section "Phiếu mua hàng" hoặc nút điều hướng nhanh `/purchases/vouchers`.
- Bổ sung thẻ thống kê "Phiếu mua hàng tháng này" (số phiếu, tổng tiền) — query nhẹ.

## 4. Cập nhật khác
- `query-invalidation.ts`: thêm key `purchase-vouchers`, invalidate cùng `journal`, `inventory`, `payables` sau post/void.
- `documents.functions.ts`: thêm loại `purchase_voucher` vào Trung tâm tài liệu (chỉ liệt kê, không cần preview file).
- Sidebar / menu kế toán: thêm "Phiếu mua hàng" dưới nhóm Mua hàng.
- Audit logging tự động qua `audit_trigger` (cần ATTACH trong migration).

## 5. Out of scope (giai đoạn sau)
- Chế độ form chi tiết nhiều dòng — schema đã sẵn `purchase_voucher_lines` nhưng UI chỉ làm form gọn ở MVP này.
- Import hàng loạt phiếu từ Excel.
- AI gợi ý định khoản cho phiếu (sẽ tái dùng `suggestJournalEntry` ở vòng sau).
