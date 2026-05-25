# Bổ sung "Đơn vị tính" (ĐVT) cho Đề xuất Fin

## Vì sao chưa hiển thị

UI bảng hàng hoá/dịch vụ đã có cột ĐVT, nhưng dữ liệu vào luôn rỗng vì **AI Parser không trích trường `unit`**. Cụ thể:

- `src/lib/ai/parse-document.functions.ts` định nghĩa Zod schema cho dòng hoá đơn ở khoảng dòng 47–57 — schema này thiếu trường `unit`, nên model không được yêu cầu trả về và `documents.ocr_extracted.lines[].unit` luôn `undefined`.
- Sau đó các đoạn map (~dòng 187, 264, 305, 921) cũng không mang `unit` đi.
- Hệ quả: `inbox-reason.server.ts` đọc `r.unit/uom` đều rỗng → cột ĐVT toàn dấu "—".

## Thay đổi

### 1. Mở rộng schema parser để AI trích ĐVT
Trong `src/lib/ai/parse-document.functions.ts`:

- Thêm `unit: z.string().nullable()` vào `InvoiceLineSchema` (dòng ~49–55), kèm `.describe("Đơn vị tính: cái, hộp, kg, lần, tháng…")` để LLM hiểu yêu cầu.
- Trong các nơi map dòng hoá đơn (~187, 264, 305, 921), thêm `unit: line?.unit ?? null` để giá trị được giữ trong `ocr_extracted.lines`.

### 2. Backfill nguồn TCT e-invoice
Với các hoá đơn đồng bộ qua TCT (`einvoice_lines.unit` đã có sẵn từ `dvtinh`), nếu document tương ứng chưa có `ocr_extracted.lines` thì hiện cột ĐVT vẫn rỗng cho đến khi re-parse. Không can thiệp luồng TCT trong patch này — chỉ ghi nhận; phần lớn user đang test bằng PDF/email forward nên fix parser là đủ.

### 3. Không đổi gì ở UI
`ProposalItemsList` (đã thêm cột ĐVT ở turn trước) tự động hiện giá trị khi `it.unit` có dữ liệu — không cần sửa.

## Cách kiểm thử

1. Upload lại 1 hoá đơn PDF bất kỳ vào Inbox AI.
2. Đợi OCR xong → mở Đề xuất Fin → bảng "Hàng hoá / dịch vụ" cột ĐVT phải hiện "cái", "hộp", "lần"…
3. Hoá đơn cũ đã OCR trước đó vẫn rỗng ĐVT (cache). Có thể bấm "Phân tích lại" (nếu có) hoặc xoá `ocr_extracted` để re-run.

## File chỉnh sửa

- `src/lib/ai/parse-document.functions.ts` — thêm `unit` vào Zod schema + 4 chỗ map.
