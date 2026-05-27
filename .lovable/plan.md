## Vấn đề

1. **Phiếu mua hàng JOY FOOD không xuất hiện**: Sau khi nhấn "Duyệt và ghi sổ" trong Inbox AI, bút toán được tạo (journal_entry `2763af47-…`) nhưng không có row nào trong bảng `purchase_vouchers`.

### Nguyên nhân lỗi tạo phiếu mua hàng

Khi user upload file XML hoá đơn `1C26MAA_00001444.xml`, hệ thống tạo **hai** rows trong `documents`:

- `5cd95fe0-…` với `doc_kind = "other"` (file gốc upload)
- `c38e68ed-…` với `doc_kind = "purchase_invoice"` (bản parse e-invoice, cùng `ai_upload_id`)

Item trong Inbox AI lại trỏ tới document "other" (`item_external_id = 5cd95fe0-…`). Khi duyệt, hàm `materializePurchaseVoucherFromDocument` ở `src/lib/inbox-ai.functions.ts:462` chặn ngay vì `doc_kind !== "purchase_invoice"` và trả về `null` âm thầm → không tạo phiếu, không báo lỗi.

## Thay đổi cần làm


| &nbsp; | &nbsp; | &nbsp; |
| ------ | ------ | ------ |


### 1.Sửa hàm materialize để chấp nhận document "other" có sibling là purchase_invoice

`src/lib/inbox-ai.functions.ts`, hàm `materializePurchaseVoucherFromDocument` (~ dòng 445-462):

- Nếu `doc.doc_kind !== "purchase_invoice"` nhưng `doc.ai_upload_id` tồn tại, query thêm 1 lần bảng `documents` để tìm sibling cùng `ai_upload_id` với `doc_kind = "purchase_invoice"`. Nếu có thì dùng sibling đó (đổi `documentId` nội bộ + reload `ai_upload_id`/`ocr_extracted`/`original_filename`). Nếu không có sibling phù hợp thì giữ nguyên hành vi `return null`.
- Áp dụng cùng pattern cho `materializeSalesVoucherFromDocument` (và `materializeSalesInvoiceFromDocument` nếu có check tương tự) để tránh lặp lại vấn đề ở Phiếu bán hàng.

### 2. Backfill phiếu mua hàng JOY FOOD đã mất

Sau khi sửa code, gọi 1 lần handler duyệt lại sẽ vướng "Đề xuất đã approved". Vì vậy backfill bằng cách tạo trực tiếp `purchase_vouchers` (+ `purchase_voucher_lines`) cho `journal_entry_id = 2763af47-6edc-46be-b138-2044feae154e` dựa trên document `c38e68ed-…` (doc_kind=purchase_invoice). Có thể thực hiện bằng:

- Một server function nội bộ một-lần (gọi `materializePurchaseVoucherFromDocument` với document purchase_invoice và journal_entry_id sẵn có), hoặc
- Một SQL INSERT thủ công qua migration nếu logic phức tạp.

Phương án ưu tiên: tạo server fn admin tạm thời `backfillJoyFoodVoucher` chạy 1 lần, sau đó xoá. Tránh đụng migration cho dữ liệu 1 record.

## Kiểm tra sau khi xong

1. Mở `/purchases/vouchers` → có dòng phiếu mua hàng cho CÔNG TY TNHH MỘT THÀNH VIÊN JOY FOOD.
2. Upload 1 hoá đơn XML mới, duyệt từ Inbox AI → phiếu mua hàng xuất hiện ngay trên `/purchases/vouchers` (xác minh fix #2 hoạt động).