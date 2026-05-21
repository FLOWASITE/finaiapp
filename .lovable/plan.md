## Mục tiêu

Khi file đính kèm là hóa đơn điện tử **XML**, thay vì hiển thị icon `FileText` chung + nút "XEM HĐ GỐC", hãy **dựng lại một bản preview giống tem hóa đơn đỏ Việt Nam** (HTML/CSS render trực tiếp từ dữ liệu XML đã parse) để người dùng nhìn thấy ngay nội dung hóa đơn — giống như khi xem file ảnh/PDF.

## Phạm vi

- Chỉ thay đổi UI trong `src/components/chat/invoice/invoice-extract-card.tsx` — phần thumbnail bên trái.
- Tạo 1 component mới `src/components/chat/invoice/xml-invoice-preview.tsx` để render "tem hóa đơn".
- Không đổi logic parse, không đổi backend, không đổi luồng stream.

## Thay đổi

### 1. Component mới `XmlInvoicePreview`

- Input: `parsed` (object trích xuất từ XML — đã có sẵn `vendor_name`, `vendor_tax_id`, `invoice_no`, `issue_date`, `lines[]`, `subtotal`, `vat_amount`, `total`, có thể có `_signed`, `_cqtCode`, `vendor_address`, `buyer_name`, `buyer_tax_id`, `buyer_address`, `serial`, `form_no`).
- Render layout cổ điển của HĐĐT VN:
  - Header đỏ: "HÓA ĐƠN GIÁ TRỊ GIA TĂNG" + ngày + ký hiệu + số HĐ.
  - Khối Người bán: tên + MST + địa chỉ.
  - Khối Người mua: tên + MST + địa chỉ (nếu có).
  - Bảng dòng hàng (rút gọn 3–5 dòng đầu, "... +N dòng" nếu nhiều hơn).
  - Tổng tiền trước thuế / VAT / Tổng thanh toán (số + chữ nếu có).
  - Badge "ĐÃ KÝ SỐ" / "Mã CQT: ..." ở góc.
- Font/màu mô phỏng hóa đơn giấy: nền trắng kem, viền/typography đỏ `#C8102E`, body `text-[10px]/[11px]` cho compact, dùng design tokens cho dark mode (border, muted-foreground...).
- Có thể scale nhỏ vừa khung thumbnail (`max-h-72`, scrollable nhẹ nếu cần) và **click để mở XML gốc** (giữ link `urlData.url` như hiện tại).

### 2. `InvoiceExtractCard`

- Thêm detect `isXml`: theo `filename` (`.xml`) hoặc `mime` (`application/xml`, `text/xml`).
- Khi `isXml`:
  - Mở rộng cột trái thành `md:grid-cols-[300px_1fr]` (giống PDF) để có chỗ cho preview.
  - Render `<XmlInvoicePreview parsed={parsed} signedUrl={urlData?.url} />` thay vì khối icon.
  - Vẫn giữ badge "đã ký số / đã xác minh" và filename bên dưới.
- Logic PDF/Image/empty giữ nguyên.

## Lưu ý kỹ thuật

- `parsed` đã có sẵn sau khi backend parse XML → component preview chỉ là pure render, không gọi server thêm.
- Nếu một số field còn thiếu (vd. `buyer_*`), fallback "—" và ẩn dòng tương ứng để layout không vỡ.
- Vẫn dùng `urlData?.url` (signed URL của file XML gốc) cho nút "Tải XML gốc" ở footer preview.
- Không thay đổi `parse-document.functions.ts` hay `einvoice-xml-parser.ts`.

## Kết quả mong đợi

Trong khung chat, thẻ HĐ XML hiển thị một "tem hóa đơn đỏ" thu nhỏ với số/ngày/NCC/MST/items/tổng tiền — người dùng nhận diện được hóa đơn ngay mà không cần bấm "XEM HĐ GỐC".
