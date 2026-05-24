## Vấn đề

Trên thẻ "Đề xuất của Fin" cho phiếu mua hàng, vùng Đối tác hiển thị **"Chưa xác định tên"** mặc dù hoá đơn đã được parse đầy đủ (số HĐ, ngày, subtotal, VAT, dòng hàng…).

## Nguyên nhân

1. **Sai key OCR.** OCR ghi vào `documents.ocr_extracted` với key `vendor_name` / `vendor_tax_id`, nhưng `buildDocumentItem` ở `src/lib/ai/inbox-reason.server.ts` chỉ đọc `supplier_name` / `partner` và `supplier_tax_id` / `tax_id`. Không match → `supplier = "—"` → `partner = "—"` → UI fallback "Chưa xác định tên".

2. **Nhánh engine chuẩn không bao giờ chạy.** Trong `src/lib/inbox-ai.functions.ts`, query `documents` không select `invoice_id`, nên nhánh `if (doc.invoice_id) proposeJournalForInvoice(...)` luôn bị skip — kể cả khi document đã được link tới một invoice đầy đủ (có supplier chuẩn từ bảng `invoices`).

## Phạm vi sửa (UI/glue, không đổi business logic)

**File 1 — `src/lib/inbox-ai.functions.ts`**
- Bổ sung `invoice_id` vào `.select(...)` của query documents (dòng ~40).

**File 2 — `src/lib/ai/inbox-reason.server.ts`** (trong `buildDocumentItem`)
- Đọc supplier theo thứ tự ưu tiên: `ext.supplier_name ?? ext.vendor_name ?? ext.partner ?? ext.seller_name`.
- Đọc tax id: `ext.supplier_tax_id ?? ext.vendor_tax_id ?? ext.tax_id ?? ext.seller_tax_id`.
- Đọc invoice_no: thêm `ext.invoice_number` vào fallback chain.
- Đọc date: thêm `ext.issue_date` vào fallback chain (hiện đang đọc `invoice_date`, nhưng DB lưu `issue_date`).
- Áp dụng đồng nhất ở cả 2 nhánh (engine path + manual fallback path) và cho `meta.supplier_name`, `meta.supplier_tax_id`, `meta.invoice_date`.

## Không đụng tới

- Schema DB, RLS, migrations.
- Logic `proposeJournalForInvoice` / `categorize/engine.server.ts`.
- UI sheet (`inbox-item-sheet.tsx`) — chỉ cần dữ liệu đúng là hiển thị đúng.

## Kết quả mong đợi

- Đối tác hiển thị đúng tên NCC từ XML (ví dụ "CÔNG TY …").
- MST đối tác hiện trong VoucherMetaGrid.
- Khi document đã link invoice, dùng engine chuẩn (vendor template, line classification) thay vì fallback heuristic.
