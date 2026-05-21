## Mục tiêu
Khi vào **Trung tâm tài liệu → tab "Hoá đơn mua"**, bảng sẽ hiển thị các trường nghiệp vụ của hoá đơn (thay vì chỉ tên file / OCR / size như hiện nay):

| Cột | Nguồn dữ liệu |
|---|---|
| Ngày HĐ | `invoices.issue_date` (fallback `documents.ocr_extracted.issue_date`) |
| Số HĐ | `invoices.invoice_no` |
| Nhà cung cấp (MST) | `invoices.supplier_name` + `supplier_tax_id` |
| Mặt hàng | Tóm tắt từ `invoice_lines` (vd: "Dịch vụ tư vấn +2 dòng") |
| Tiền trước thuế | `invoices.subtotal` |
| Thuế (VAT) | `invoices.vat_amount` |
| Tổng sau thuế | `invoices.total` |
| Trạng thái | `documents.ocr_status` + `invoices.status` (Chờ OCR / Đã bóc tách / Đã ghi sổ) |
| File | icon mở preview (giữ hành vi hiện tại) |

Click vào hàng → mở Drawer xem preview như hiện tại; thêm nút **"Mở chi tiết hoá đơn"** đi tới `/invoices/$id` để duyệt/định khoản.

## Các thay đổi

### 1. Server function mới: `listPurchaseDocuments`
Trong `src/lib/documents.functions.ts`, thêm 1 fn riêng cho tab purchase:
- Query `documents` (filter `doc_kind='purchase_invoice'`, search, source, ocr_status, date range, limit/offset).
- Với mỗi document, lấy `invoice` liên kết qua `document_links` (entity_table='invoices') — join `invoices` + `invoice_lines(description)` để lấy đủ 7 trường nghiệp vụ + tóm tắt mặt hàng.
- Trả `{ rows: Array<{ doc, invoice, lines_summary }>, total }`.
- Giữ nguyên `listDocuments` cũ cho các tab khác.

### 2. UI tab purchase trong `src/routes/_app/documents/index.tsx`
- Khi `currentTab === 'purchase'`: render component bảng riêng `<PurchaseInvoicesTable />` với 9 cột nghiệp vụ ở trên.
- Các tab khác giữ nguyên bảng hiện tại.
- Reuse các filter hiện có (search, source, OCR status, date) — bộ lọc OCR/source vẫn áp dụng cho documents.
- Tổng kết nhanh ở đầu bảng: tổng tiền hàng / VAT / tổng (sum của các row đang load) — nhỏ gọn, 1 dòng.

### 3. Drawer chi tiết
- Khi mở document có liên kết invoice: thêm nút **"Mở chi tiết hoá đơn →"** trong tab "Liên kết" (link tới `/invoices/$id`).
- Không đổi logic preview/OCR/xoá hiện tại.

### Lưu ý
- Hoá đơn chưa có liên kết invoice (mới upload, chưa OCR): các cột nghiệp vụ hiển thị "—" và badge "Chờ OCR".
- Không thay đổi schema DB, không tạo migration.
- Chỉ thay đổi UI + 1 server function read-only — không đụng tới flow upload/OCR/chat đã hoạt động.
