Mình đã kiểm tra: mã nguồn hiện tại đã có UI mới (`Trung tâm chứng từ`, tab, nút `Bộ lọc`). Trình preview trực tiếp cũng đang hiển thị UI mới. Ảnh bạn gửi vẫn là giao diện cũ vì nhiều khả năng bạn đang xem bản chưa reload/cache hoặc đang ở một preview/published URL cũ.

Kế hoạch xử lý:

1. Xác nhận đúng route và bản preview
- Kiểm tra URL đang mở là `/documents` trong preview mới, không phải published/custom domain cũ.
- Nếu bạn đang xem trên điện thoại qua Chrome, cần reload cứng/đóng tab mở lại vì trình duyệt mobile thường giữ phiên cũ.

2. Làm UI dễ nhận biết hơn để tránh nhầm với bản cũ
- Đổi tiêu đề rõ ràng thành `Trung tâm chứng từ`.
- Giữ tab thống nhất: `Tất cả`, `Hoá đơn mua`, `Hoá đơn bán`, `Hoá đơn điện tử`, `Tài liệu khác`.
- Đảm bảo search/filter compact luôn hiện đúng trên mobile: ô tìm kiếm + nút `Bộ lọc`, không còn 4 dropdown xếp dọc như ảnh cũ.

3. Nếu vẫn không đổi sau khi reload
- Kiểm tra lỗi runtime/network trên preview.
- Nếu route đang fallback vào bundle cũ, restart dev preview để nạp lại mã mới.

4. Sau khi bạn bấm Implement plan
- Mình sẽ chỉnh nhẹ phần UI `/documents` để bản mới nổi bật và tối ưu mobile hơn.
- Sau đó mở preview kiểm tra lại đúng viewport điện thoại và xác nhận không còn giao diện search/filter cũ.