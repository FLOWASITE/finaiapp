## Kế hoạch sửa

### 1. Sửa nguyên nhân PDF không hiện trên mobile
- Đổi phần preview PDF trong `InvoiceExtractCard` để mobile không chỉ hiện nút/link mà hiển thị bản xem được ngay trong app.
- Với PDF trên mobile, tạo preview bằng trang ảnh/bitmap hoặc fallback ổn định thay vì phụ thuộc `<iframe>` vì Android Chrome/WebView thường không render PDF inline.
- Giữ hành động “Mở PDF gốc” nhưng không dùng nó làm cách xem duy nhất.

### 2. Chuẩn hóa MIME type PDF khi upload
- Trong `composer.tsx`, nếu tên file kết thúc bằng `.pdf` nhưng `file.type` rỗng/sai, gửi `application/pdf` lên parser và lưu vào attachment.
- Điều này tránh PDF bị nhận nhầm thành `unknown`, làm card không đi vào nhánh preview PDF.

### 3. Sửa lỗi parse hiển thị “unknown” và schema invalid_type
- Trong `parse-document.functions.ts`, chuẩn hóa dữ liệu AI trả về trước khi validate schema:
  - chuỗi rỗng hoặc sai kiểu cho trường string -> `null`
  - số dạng text có dấu chấm/phẩy tiền Việt -> number
  - `lines` sai kiểu -> `[]`
- Không show nguyên JSON lỗi Zod dài ra UI; thay bằng thông báo ngắn dễ hiểu.

### 4. Fallback OCR/Vision đúng khi PDF đọc text kém
- Nếu PDF có text-layer nghèo hoặc AI trả kết quả rỗng/thiếu trường chính, retry bằng Vision trực tiếp trên file PDF gốc.
- Gắn `_rawText` và `_parserNotes` để người dùng xem hệ thống đã đọc được gì.

### 5. Kiểm tra kết quả
- Kiểm tra lại upload PDF, card hóa đơn, signed URL và nhánh mobile/desktop.
- Không sửa `routeTree.gen.ts` thủ công; để hệ thống tự sinh lại.