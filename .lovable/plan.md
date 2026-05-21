## Mục tiêu

Đem trải nghiệm xem hoá đơn của chatbot (XML einvoice template đỏ kiểu HĐĐT VN + PDF render bằng pdfjs canvas + nút "Xem lớn") sang trang **Trung tâm tài liệu**, áp dụng cho 2 tab **Hoá đơn mua** và **Hoá đơn bán**.

Phạm vi: chỉ doc có `doc_kind ∈ {purchase_invoice, sales_invoice}`. Các tab khác (Tất cả, Ngân hàng) giữ preview cũ.

---

## Phần 1 — Tách viewer khỏi chat thành component dùng chung

Hiện tại `XmlInvoicePreview` đã thuần (chỉ nhận `data` + `signedUrl`), nhưng `PdfPagePreview` đang nằm bên trong `invoice-extract-card.tsx`. Tách ra để cả chat lẫn Document Center cùng dùng:

- Tạo `src/components/invoice-viewer/pdf-page-preview.tsx` chứa `PdfPagePreview` (copy nguyên từ `invoice-extract-card.tsx`).
- Tạo `src/components/invoice-viewer/invoice-file-viewer.tsx` — component "chỉ phần preview file" (XML/PDF/ảnh + nút Xem lớn + Dialog zoom), tách từ phần preview-cột-trái của `InvoiceExtractCard`. Props: `{ einvoice, signedUrl, mimeType, filename }`.
- Cập nhật `invoice-extract-card.tsx` import lại 2 component này (giữ nguyên hành vi chat).

Không thay đổi `xml-invoice-preview.tsx` (đã reusable).

---

## Phần 2 — Nâng cấp tab "Xem trước" trong `DocumentDrawer`

File: `src/routes/_app/documents/index.tsx` → hàm `DocumentDrawer`.

Trong `TabsContent value="preview"`, nếu `doc.doc_kind ∈ {purchase_invoice, sales_invoice}`:
- Lấy `einvoice = doc.ocr_extracted?._einvoice ?? null`.
- Render `<InvoiceFileViewer einvoice={einvoice} signedUrl={data.signedUrl} mimeType={doc.mime_type} filename={doc.original_filename} />`.
- Fallback: nếu không phải 2 kind trên → giữ nguyên img/iframe hiện tại.

---

## Phần 3 — Nút "Xem hoá đơn" trên mỗi dòng (Dialog full)

Trong `PurchaseInvoicesTable` và `SalesInvoicesTable`:

- Cột "File" thêm 1 nút icon mới (icon `Eye` thì đã có cho "mở drawer"; dùng `FileSearch` hoặc `Maximize2` cho "xem hoá đơn") đứng cạnh nút mở drawer.
- Click → mở 1 `Dialog` mới (state cục bộ `viewerDocId`).
- Dialog content: layout 2 cột giống chat:
  - Trái: `<InvoiceFileViewer ... />` (XML template hoặc PDF canvas).
  - Phải: card thông tin trích xuất gọn (Số HĐ / Ngày / NCC hoặc KH / MST / Tiền trước thuế / VAT / Tổng) — tái dùng dữ liệu `r.invoice` đã có sẵn trong row, không cần fetch thêm.
- Tải `signedUrl` cho doc bằng `useServerFn(getDocument)` chỉ khi dialog mở (`enabled: !!viewerDocId`).
- Tiêu đề dialog: số HĐ + tên file.
- Footer dialog: link "Mở chi tiết hoá đơn" → `/invoices/$id` (mua) hoặc `/sales/$id` (bán), + nút "Mở Drawer" để chuyển sang Drawer tài liệu nếu cần thao tác file.

---

## Phần 4 — Đảm bảo dữ liệu `_einvoice` luôn có cho file XML

Khi doc XML được upload thủ công ngoài chat, `ocr_extracted._einvoice` có thể chưa được điền nếu parser path khác không gọi `parsedXmlToPurchaseInvoice`. Kiểm tra `reparseDocument` (đã có nút "Parse lại" trong Drawer) — nếu nhánh XML chưa gắn `_einvoice`, bổ sung 1 lần để đảm bảo:

- Trong `src/lib/ai/parse-document.functions.ts` nhánh `parsedXml` (line ~852), confirm output đi qua `parsedXmlToPurchaseInvoice` (đã có `_einvoice`). Nếu có path khác bỏ qua → thêm fallback gắn `_einvoice` trước khi ghi `ocr_extracted`.

Không tạo migration. Không thêm cột mới.

---

## Technical notes

- **Routing**: không thêm route mới; mọi thay đổi nằm trong `documents/index.tsx` + components mới.
- **Lazy load**: `PdfPagePreview` đã dynamic-import `pdfjs-dist` — giữ nguyên để không tăng bundle ban đầu của trang documents.
- **Worker URL**: import `pdf.worker.mjs?url` đã được Vite handle, dùng lại cùng cách trong file mới tách.
- **State**: `viewerDocId` là `useState<string|null>` trong từng table component (cục bộ, không cần URL search param).
- **Không đổi server functions** (`listPurchaseDocuments`, `listSalesDocuments`, `getDocument`) — đã đủ data.

```text
src/components/invoice-viewer/
├── pdf-page-preview.tsx          (tách từ invoice-extract-card)
└── invoice-file-viewer.tsx       (mới — XML/PDF/img + zoom dialog)

src/components/chat/invoice/
└── invoice-extract-card.tsx      (refactor: import 2 file trên)

src/routes/_app/documents/index.tsx
├── DocumentDrawer                (preview tab dùng InvoiceFileViewer khi là HĐ)
├── PurchaseInvoicesTable         (+ nút Xem HĐ + Dialog viewer)
└── SalesInvoicesTable            (+ nút Xem HĐ + Dialog viewer)
```

---

## Out of scope

- Không đụng tab "Tất cả" / "Ngân hàng".
- Không thêm chỉnh sửa hoá đơn trong Dialog (chỉ xem; nếu muốn edit → bấm "Mở chi tiết hoá đơn" sang `/invoices/$id` hoặc `/sales/$id`).
- Không thay đổi schema DB.
