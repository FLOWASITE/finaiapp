## Mục tiêu

Khi user tick checkbox **Xuất HĐ** trong form Phiếu bán hàng, hiện thêm một block UI để nhập thông tin tờ hoá đơn đầu ra (e-invoice) gắn với phiếu bán hàng này. Khi lưu phiếu, tự động tạo bản ghi trong bảng `einvoices` (direction = `out`) và link vào phiếu qua `matched_sales_invoice_id`.

## Phạm vi UI (file `src/routes/_app/sales/vouchers.tsx`)

Khi `form.issue_einvoice === true`, render một section mới ngay sau block "Phiếu bán hàng" (trước "Giá trị hàng"), tiêu đề **"Thông tin hoá đơn đầu ra"**, layout `grid grid-cols-2 md:grid-cols-4 gap-3` đồng bộ với các block khác:

Các trường nhập (theo schema bảng `einvoices`):
- **Mẫu số** (`invoice_template`) — text, ví dụ `1/001`
- **Ký hiệu** (`invoice_series`) — text, ví dụ `K25TAA`
- **Số hoá đơn** (`invoice_no`) — text, *bắt buộc*
- **Ngày hoá đơn** (`issue_date`) — date, mặc định bằng `voucher_date`
- **Mã tra cứu CQT** (`tct_lookup_code`) — text, optional
- **Ghi chú HĐĐT** (`notes`) — text, optional

Các field còn lại tự lấy từ phiếu bán hàng khi submit:
- `direction = 'out'`, `source = 'manual'`
- `buyer_*` ← `customer_*`
- `seller_*` ← thông tin tenant (lấy từ settings hiện có)
- `currency`, `subtotal`, `vat_amount`, `total` ← tổng tiền phiếu
- `branch_id`, `department_id`, `project_id`, `cost_center_id` ← từ phiếu

## Phạm vi state & form

Thêm vào `FormState` (line 277-299) và `blankForm` (301-324):
```
einvoice: {
  invoice_template: string;
  invoice_series: string;
  invoice_no: string;
  issue_date: string;
  tct_lookup_code: string;
  notes: string;
}
```
Khi load voucher edit (line ~480-500), nếu có einvoice đã link (qua `matched_sales_invoice_id`) thì prefill và set `issue_einvoice = true`.

## Phạm vi server (file `src/lib/sales-vouchers.functions.ts`)

1. Mở rộng schema input của `createSalesVoucher` / `updateSalesVoucher` để nhận thêm object `einvoice` (optional).
2. Trong handler, sau khi insert/update phiếu bán hàng:
   - Nếu `issue_einvoice = true` và có `einvoice.invoice_no`:
     - Tạo (hoặc update nếu đã có) row trong `einvoices` với `direction = 'out'`, các field map như mô tả ở trên.
     - Set `matched_sales_invoice_id = <voucher.id>`, `matched_at = now()`.
   - Nếu user bỏ tick `issue_einvoice` khi edit: unlink (set `matched_sales_invoice_id = null` trên einvoice cũ) — không xoá hẳn để giữ lịch sử.
3. Khi `getSalesVoucher`, trả thêm einvoice đã link (lookup theo `matched_sales_invoice_id = voucher.id`).

## Validation

- Nếu tick "Xuất HĐ" mà không nhập `invoice_no` → toast lỗi, không submit.
- Số HĐ trùng (unique constraint `tenant_id + direction + seller_tax_id + series + no`) → bắt error và hiện toast tiếng Việt rõ ràng.

## Không thay đổi

- Không động đến luồng "Xuất kho" hay phần Thu tiền/Phiếu ngân hàng đã có.
- Không tạo trang/route mới — toàn bộ trong dialog hiện tại.
- Không gọi API TCT — chỉ lưu metadata thủ công ở bước này.
