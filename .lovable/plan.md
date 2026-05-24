## Vấn đề

Khi user bấm "Duyệt & ghi sổ" một hoá đơn bán hàng trong Inbox AI, hệ thống chỉ tạo `journal_entries` + `journal_lines` và đánh dấu `documents.ocr_status='done'`. **Không có dòng nào được thêm vào bảng `sales_invoices`** → danh sách phiếu bán hàng (Trung tâm bán hàng) không hiển thị hoá đơn này.

So sánh: với hoá đơn mua, AI gọi tool `createPurchaseInvoice` trước, tạo dòng trong `invoices` rồi mới hạch toán. Phía bán chưa có bước tương đương.

## Giải pháp

Trong `approveInboxItem` (`src/lib/inbox-ai.functions.ts`), khi `source === "document"` và document có `doc_kind === "sales_invoice"`:

1. Đọc `documents` + `ai_uploads.parsed` để lấy dữ liệu eInvoice đã parse (seller, buyer, lines, totals, series, invoice number).
2. Tìm/tạo `customers` theo `buyer.tax_id` (nếu chưa có thì insert tối thiểu name + tax_id + address + email).
3. Insert một dòng `sales_invoices`:
   - `user_id`, `tenant_id`, `customer_id`, `customer_name`, `customer_tax_id`, `billing_address`
   - `invoice_no` = `series + "-" + invoice_number` (nếu có), `issue_date` = ngày trên XML hoặc `entry_date`
   - `currency = "VND"`, `subtotal`, `vat_amount`, `total` từ `_einvoice.totals`
   - `status = "approved"` (đã ghi sổ), `source = "einvoice_xml"`, `source_document_id` (nếu cột có)
4. Insert `sales_invoice_lines` từ `_einvoice.lines` (description, qty, unit_price, vat_rate, amount, pre_vat / vat tính lại).
5. Lưu `sales_invoice_id` vào `journal_entries.invoice_id` (hoặc một cột phụ nếu schema tách) để liên kết bút toán ↔ hoá đơn.
6. Cập nhật `documents.ref_table='sales_invoices', ref_id=<new id>` (nếu cột tồn tại) để tab Hoá đơn bán ra link sang chứng từ.

Nếu document đã có sẵn `sales_invoices` (do đã được tạo bởi luồng XML store trước đây), **không insert lần nữa** — chỉ link và ghi sổ. Kiểm tra trùng theo `(tenant_id, invoice_no, customer_tax_id)` hoặc theo `source_document_id`.

Bọc bước này trong try/catch: nếu tạo sales_invoices fail, vẫn cho phép journal entry tồn tại nhưng trả về cảnh báo cho UI (không chặn ghi sổ).

## Kỹ thuật

- File chỉnh: `src/lib/inbox-ai.functions.ts` (thêm helper `materializeSalesInvoiceFromDocument`).
- Truy vấn schema thực tế của `sales_invoices` để biết các cột bắt buộc (xem `sales.functions.ts` lines 174–230 làm tham chiếu payload).
- Không thay đổi UI; danh sách `/sales` đã đọc từ `sales_invoices` nên sẽ tự xuất hiện.
- Không tạo migration mới (dùng cột hiện có). Nếu thiếu cột `source_document_id`/`source` thì sẽ thêm migration nhỏ (chỉ khi cần).

## Kết quả mong đợi

- Sau khi duyệt hoá đơn bán XML trong Inbox AI: xuất hiện trong **Trung tâm bán hàng → Hoá đơn bán** với đúng số HĐ, KH, tổng tiền, trạng thái "Đã duyệt", có link sang bút toán và file XML gốc.
- Hoá đơn mua giữ nguyên hành vi hiện tại.
