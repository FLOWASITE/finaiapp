Mục tiêu: khi upload PDF trong chat, thẻ kết quả phải cho người dùng thấy nội dung PDF/đoạn trích đã đọc được, không chỉ hiện nút “Xem HĐ gốc”.

Kế hoạch triển khai:

1. Mở rộng dữ liệu trả về cho URL file gốc
- Cập nhật server function `getUploadSignedUrl` để trả thêm `mimeType` cùng filename/document id.
- Giữ kiểm tra quyền theo user hiện tại như cũ.

2. Hiển thị PDF inline trong thẻ hóa đơn
- Trong `InvoiceExtractCard`, nhận biết PDF qua filename hoặc mime type.
- Nếu là ảnh: giữ thumbnail ảnh như hiện tại.
- Nếu là PDF: hiển thị khung preview PDF bằng signed URL (`iframe`/`object`) trong vùng bên trái hoặc khung cao hơn phù hợp, kèm link mở file gốc.
- Nếu trình duyệt/mobile không render được PDF inline, vẫn có nút mở file PDF trong tab mới.

3. Hiển thị nội dung đã trích xuất khi PDF không có thumbnail
- Với PDF, thêm phần “Nội dung đã đọc” lấy từ `parsed._rawText`, `parsed.notes`, hoặc một số field quan trọng đã extract được.
- Tránh tình trạng người dùng chỉ thấy các field rỗng “— / 0đ” mà không biết hệ thống đã đọc được gì.

4. Sửa trạng thái rỗng cho dễ hiểu
- Nếu parse PDF thất bại hoặc không có text, hiện thông báo ngắn: “Chưa đọc được nội dung PDF — mở file gốc để kiểm tra”, thay vì card giống như đã xử lý thành công.

5. Kiểm tra sau sửa
- Kiểm tra luồng PDF trong chat: upload → parse → card hiển thị preview/link/nội dung trích xuất.
- Kiểm tra không làm hỏng luồng ảnh hóa đơn hiện tại.