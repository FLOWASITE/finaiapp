Mình sẽ sửa theo hướng làm luồng attach ổn định hơn, không phụ thuộc vào event giữa component vừa unmount/mount.

1. Tạo cơ chế “handoff” bền hơn cho file attach
- Khi gửi file từ ChatDock ngoài trang chat, lưu payload file vào `sessionStorage` theo một key có `handoffId` riêng.
- Điều hướng sang `/chat/$threadId` kèm `handoffId` trong search params.
- ChatThread đọc đúng `handoffId` sau khi mount để lấy file, thay vì chỉ dựa vào key theo `threadId` tạm.

2. Tránh tự xoá params quá sớm gây remount/reset
- Hiện ChatThread xoá `autostart/optimistic` khỏi URL ngay sau khi bắt đầu chạy, rồi lại replace từ temp id sang real id; chuỗi replace này dễ tạo cảm giác refresh và làm mất state.
- Giữ trạng thái trong component ổn định hơn: chỉ replace URL khi cần đổi từ temp id sang real id, và không reset `localMsgs/input/abortRef` trong lần swap này.

3. Sửa fallback có thể gây full page reload
- Thay `window.location.href = from` trong nhánh lỗi bằng TanStack navigation an toàn khi có thể, để không reload toàn trang.
- Với `from` là URL nội bộ, dùng `navigate`; chỉ fallback khi URL không parse được.

4. Đồng bộ attach khi đang ở sẵn trong ChatThread
- Dùng cùng helper lưu/đọc payload để tránh trường hợp event `chat:dock-send` chạy trước khi ThreadPage kịp đăng ký listener.
- Khi nhận attach, ưu tiên payload đầy đủ có base64; nếu chỉ còn metadata thì báo rõ cần gửi lại file.

5. Kiểm tra sau sửa
- Kiểm tra luồng: attach ở dashboard/chatdock → tạo temp thread → tự chạy parse → swap sang real thread không mất ảnh/file.
- Kiểm tra luồng: attach ngay trong `/chat/$threadId` vẫn gửi được bình thường và không reload.