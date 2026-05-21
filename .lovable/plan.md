## Vấn đề cần sửa

PDF hiện đang có hai điểm yếu riêng:

1. **Không đọc được dữ liệu hóa đơn**: luồng parse đang phụ thuộc vào text-layer/LlamaParse rồi mới fallback sang Vision. Với PDF scan hoặc PDF có text-layer nghèo, kết quả dễ rỗng hoặc thiếu trường quan trọng.
2. **Không xem được PDF trên mobile**: giao diện đang dùng `iframe`/mở tab mới; nhiều trình duyệt mobile không render PDF inline ổn định, nên người dùng chỉ thấy khung “Xem hóa đơn PDF” thay vì nội dung.

## Kế hoạch triển khai

### 1. Củng cố parser PDF đầu vào
- Sửa `src/lib/ai/parse-document.functions.ts` để PDF hóa đơn luôn có fallback Vision đáng tin cậy khi:
  - native text extraction rỗng/nghèo,
  - LlamaParse không khả dụng/thất bại,
  - AI trả JSON rỗng hoặc thiếu các trường chính như NCC, số HĐ, ngày, tổng tiền, dòng hàng.
- Thêm bước “quality check” sau parse: nếu kết quả hóa đơn rỗng/không có dòng hàng thì tự retry bằng Vision trực tiếp trên file PDF gốc.
- Gắn `_rawText`, `_parserNotes`/warning vào kết quả để UI hiển thị rõ parser đã dùng và lý do fallback.

### 2. Chuẩn hóa MIME type PDF từ client
- Sửa `src/components/chat/composer.tsx` để nếu trình duyệt gửi `file.type` rỗng hoặc sai nhưng tên file `.pdf`, hệ thống vẫn set `mime = application/pdf`.
- Điều này tránh trường hợp PDF không đi vào nhánh xử lý PDF/Vision đúng cách.

### 3. Cải thiện xem PDF trên mobile
- Sửa `src/components/chat/invoice/invoice-extract-card.tsx`:
  - Desktop vẫn dùng iframe preview.
  - Mobile không phụ thuộc iframe; hiển thị hành động rõ ràng “Mở PDF”/“Tải PDF” và dialog không cố render iframe nếu trình duyệt mobile không hỗ trợ.
  - Giữ signed URL hiện có, không thay đổi quyền truy cập file.

### 4. Hiển thị lỗi đọc PDF có ích hơn
- Khi parse thất bại hoặc kết quả rỗng, card sẽ hiển thị thông báo cụ thể hơn: “PDF scan/không có text-layer, đã thử OCR Vision nhưng chưa đọc đủ dữ liệu” thay vì chỉ báo chung chung.
- Nếu có text đã trích xuất, vẫn cho xem nội dung thô để đối chiếu.

### 5. Kiểm tra sau sửa
- Không chạy build thủ công.
- Kiểm tra bằng lint/type feedback tự động của môi trường và rà lại các file đã sửa để đảm bảo không phá luồng upload, pending attachment, proposal duyệt hóa đơn.