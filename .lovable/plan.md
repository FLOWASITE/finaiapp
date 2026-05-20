Mình đã kiểm tra lại mã nguồn: trong repo hiện không còn chuỗi tiêu đề cũ `Tài liệu / Kho lưu trữ tập trung`; file `/documents` đã là `Trung tâm chứng từ`. Ảnh bạn gửi vẫn hiện bản cũ nên nguyên nhân gần như chắc chắn là thiết bị đang mở bản bundle cũ/published cũ/cache cũ, không phải mã nguồn hiện tại.

Kế hoạch xử lý dứt điểm:

1. Buộc thay đổi khó nhầm trên chính route `/documents`
- Đổi cả breadcrumb/page title từ `Documents`/`Tài liệu` sang `Trung tâm chứng từ` nếu nguồn breadcrumb còn lấy label cũ.
- Đặt headline mới thật nổi bật và khác hoàn toàn bản cũ.
- Thêm hàng tab ngay dưới headline để nếu không thấy tab thì biết chắc đang xem bundle cũ.

2. Loại bỏ hoàn toàn UI filter cũ trên mobile
- Search chỉ còn 1 ô tìm kiếm + 1 nút icon lọc.
- Các dropdown `Tất cả loại`, `Mọi OCR`, nguồn, ngày chỉ xuất hiện trong popover sau khi bấm lọc.
- Không để bất kỳ layout nào có 4 ô filter xếp dọc như ảnh bạn gửi.

3. Kiểm tra route và menu
- Kiểm tra sidebar/link đang trỏ đúng `/documents`, không trỏ route cũ hoặc URL published.
- Nếu breadcrumb vẫn hiện `Documents`, chỉnh mapping breadcrumb sang tiếng Việt.

4. Làm mới preview
- Restart dev server sau khi sửa.
- Mở lại `/documents` bằng browser tool ở viewport giống điện thoại để xác nhận thấy `Trung tâm chứng từ`.

5. Nếu trên điện thoại của bạn vẫn không thấy sau bước này
- Cần mở đúng preview URL mới hoặc hard refresh/đóng hẳn tab Chrome rồi mở lại.
- Nếu bạn đang xem `finaiapp.lovable.app` hoặc `app.finai.one`, đó là bản published; phải Publish lại thì mới thấy thay đổi trên domain đó.