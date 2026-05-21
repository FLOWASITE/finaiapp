Mình đã xác định lỗi chính: khi gửi file từ ChatDock để tạo hội thoại mới, app điều hướng ngay sang `/chat/:threadId` trong lúc việc upload file và tạo thread chạy nền. Nhưng state chờ tạo thread chỉ nằm trong memory của tab hiện tại và có thể không còn/không kịp đăng ký sau khi route mount, nên trang thread gọi `getThread` quá sớm và nhận `notFound: true`.

Kế hoạch sửa:

1. Bỏ phụ thuộc vào handoff memory cho trạng thái tạo thread
- Khi tạo chat mới từ file hoặc text, vẫn có thể hiển thị optimistic UI ngay.
- Nhưng trang thread sẽ không coi `notFound` là lỗi ngay nếu URL có `pending=1` hoặc cache đã có thread tạm.
- Thay vào đó, trang sẽ poll/refetch ngắn trong vài giây để chờ row thật được tạo.

2. Làm luồng tạo thread bền hơn khi upload PDF chậm
- Với file đính kèm, tạo thread + user message trước bằng metadata tạm.
- Upload file PDF chạy sau đó và cập nhật cache/message metadata khi xong.
- Như vậy `/chat/:threadId` luôn có thread thật để load, không còn rơi vào màn “Không tìm thấy cuộc trò chuyện”.

3. Sửa màn not-found thành trạng thái phục hồi được
- Nếu hội thoại chưa tạo xong: hiển thị trạng thái “Đang chuẩn bị cuộc trò chuyện…” thay vì lỗi.
- Chỉ hiện “Không tìm thấy” khi đã hết thời gian chờ hoặc URL không phải pending.
- Nút “Tải lại” sẽ invalidate/refetch đúng query thay vì chỉ refetch một lần.

4. Giữ nguyên phần đọc PDF đã làm trước đó
- Không thay đổi logic parse PDF/canvas preview nếu không cần.
- Chỉ chỉnh luồng chat/thread để file PDF được đưa vào hội thoại ổn định trước khi AI đọc.

5. Kiểm chứng sau khi sửa
- Kiểm tra network/server logs để đảm bảo sau khi upload PDF có request tạo `chat_threads` và `chat_messages` thành công.
- Xác nhận route `/chat/:threadId` không còn trả `notFound: true` ngay sau khi gửi PDF.
- Không chỉnh `routeTree.gen.ts` thủ công.