# Huỷ ghi sổ Phiếu bán hàng & Phiếu mua hàng

## Mục tiêu
1. Khi bấm "Huỷ ghi sổ" → hiện dialog liệt kê các chứng từ liên quan sẽ bị huỷ (phiếu thu/chi, phiếu nhập/xuất, bút toán…).
2. Sau khi huỷ, phiếu quay về trạng thái `draft` và có nút "Ghi sổ lại".

## Backend

### `src/lib/sales-vouchers.functions.ts`
- **`previewVoidSalesVoucher(id)`** (mới): trả về danh sách sẽ bị xoá:
  - `journal_entries` doanh thu + COGS
  - `stock_vouchers` (phiếu xuất) + `stock_movements`
  - `cash_vouchers` / `bank_vouchers` liên kết
  - Tóm tắt: số phiếu, ngày, số tiền
- **`voidSalesVoucher`** (sửa): xoá hẳn thay vì tạo bút toán đảo:
  1. Clear `bank_transactions.matched_entry_id` nếu có
  2. Delete `cash_vouchers`, `bank_vouchers` của phiếu
  3. Delete `stock_movements` + `stock_vouchers` + COGS `journal_lines/entries`
  4. Delete revenue `journal_lines/entries`
  5. Update `sales_vouchers`: `status='draft'`, `posted_at=null`, `paid_amount=0`, `payment_status='unpaid'`, `journal_entry_id=null`

### `src/lib/purchase-vouchers.functions.ts`
- **`previewVoidPurchaseVoucher(id)`** (mới): tương tự cho phiếu mua.
- **`voidPurchaseVoucher`** (sửa): xoá hẳn `journal_entries`, `stock_vouchers`(nhập), `stock_movements`, `cash_vouchers`/`bank_vouchers`, đưa về `draft` để có thể ghi sổ lại.

## Frontend

### `src/components/void-confirm-dialog.tsx` (mới)
Dialog dùng chung:
- Nhận `previewData` (list các mục sẽ xoá)
- Hiện cảnh báo + danh sách nhóm theo loại chứng từ
- Nút "Xác nhận huỷ ghi sổ" / "Huỷ"

### `src/routes/_app/sales/vouchers.tsx`
- Khi `status='posted'`: nút **"Huỷ ghi sổ"** → gọi `previewVoidSalesVoucher` → mở dialog → confirm → `voidSalesVoucher`
- Khi `status='draft'` và `posted_at` từng có / chưa: nút **"Ghi sổ"** (hoặc "Ghi sổ lại")

### `src/routes/_app/purchases/vouchers.tsx`
- Cùng pattern: "Huỷ ghi sổ" + dialog preview, sau đó "Ghi sổ lại".

## Không thay đổi
- DB schema, RLS, triggers
- `postSalesVoucher` / `postPurchaseVoucher` (tái dùng cho ghi sổ lại)
- Report logic

## Rủi ro
- `is_period_locked`: vẫn chặn nếu kỳ đã khoá → trả lỗi rõ ràng.
- FK `bank_transactions.matched_entry_id` → clear trước khi delete.
