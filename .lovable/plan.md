## Mục tiêu

Khi bấm **Duyệt & ghi sổ** với hoá đơn bán hàng trong Inbox AI:
- Tạo đúng bản ghi trong **Phiếu bán hàng** (`sales_vouchers`), không chỉ tạo `sales_invoices`.
- Phiếu bán hàng có dòng hàng hoá/dịch vụ đầy đủ.
- Card Inbox AI đổi trạng thái sau khi duyệt, không còn nhìn như “chưa xử lý”.
- Nếu tạo phiếu thất bại, UI phải báo lỗi thật, không được báo “Đã ghi sổ” giả.

## Kế hoạch sửa

1. **Sửa backend duyệt Inbox AI**
   - Trong `src/lib/inbox-ai.functions.ts`, thay helper hiện tại bằng helper tạo/ghép **sales_vouchers** từ XML hoá đơn bán ra.
   - Lấy dữ liệu từ `documents.ocr_extracted` và `ai_uploads.parsed._einvoice` để tránh thiếu dữ liệu khi một nguồn parse không đủ.
   - Tìm/tạo khách hàng theo MST người mua.
   - Tạo `sales_vouchers` với:
     - `voucher_no` dạng `BHYYYY-xxxxx` hoặc theo số HĐ nếu phù hợp.
     - `voucher_date`, `customer_name`, `customer_tax_id`, `customer_address`.
     - `subtotal`, `vat_amount`, `total`, `payment_status='unpaid'`, `status='posted'`.
     - `journal_entry_id` trỏ tới bút toán vừa tạo.
   - Tạo `sales_voucher_lines` từ hàng hoá/dịch vụ XML với `qty`, `unit_price`, `amount`, `vat_rate`, `vat_amount`, `total`, tài khoản doanh thu/thuế mặc định.
   - Vẫn có thể tạo/ghép `sales_invoices` để liên kết hoá đơn điện tử nếu cần, nhưng **danh sách Phiếu bán hàng sẽ đọc từ `sales_vouchers`**.

2. **Không nuốt lỗi tạo phiếu**
   - Hiện tại helper có thể fail nhưng `approveInboxItem` vẫn trả thành công nên UI báo “Đã ghi sổ”.
   - Sửa để nếu document là `sales_invoice` mà không tạo/ghép được phiếu bán hàng thì server function ném lỗi rõ ràng.
   - Chỉ đánh dấu chứng từ đã xử lý sau khi tạo phiếu/bút toán/decision thành công.

3. **Sửa refresh UI sau duyệt**
   - Trong `src/routes/_app/inbox.tsx`, sau duyệt thành công sẽ invalidate thêm:
     - `sales-vouchers`
     - `sales-invoices`
     - `sales-dashboard`
     - các query sổ sách liên quan qua helper hiện có.
   - Với card vừa duyệt, cập nhật optimistic/local state sang `posted` hoặc loại khỏi Inbox ngay để người dùng thấy trạng thái đổi tức thì.

4. **Bổ sung hiển thị trạng thái card**
   - Đảm bảo card dùng `processing_status='posted'` sau approve thay vì giữ `auto_ready/ready`.
   - Nếu refresh server chưa kịp trả dữ liệu mới, UI vẫn hiển thị “Đã hạch toán/Đã ghi sổ” cho item vừa duyệt.

5. **Kiểm tra dữ liệu hiện có**
   - Backfill hoá đơn `1C26TYY_00000138.xml` đang có `sales_invoice_id` nhưng chưa có `sales_vouchers` tương ứng.
   - Liên kết `sales_vouchers.journal_entry_id` với bút toán đã tạo để nó xuất hiện trong danh sách phiếu bán hàng và danh sách chứng từ/sổ sách.

## File dự kiến sửa

- `src/lib/inbox-ai.functions.ts`
- `src/routes/_app/inbox.tsx`

## Xác nhận sau khi sửa

- Query database kiểm tra có dòng mới trong `sales_vouchers` và `sales_voucher_lines`.
- Mở/refresh danh sách **Bán hàng → Phiếu bán hàng** phải thấy phiếu.
- Card Inbox AI phải đổi trạng thái sau khi duyệt hoặc biến khỏi danh sách chờ xử lý.