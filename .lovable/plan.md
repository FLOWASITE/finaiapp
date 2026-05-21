## Mục tiêu
Giữ nguyên payload file attach (bao gồm base64) khi gửi từ ChatDock sang trang chat thread, để thread tự động stream parse OCR → extract → match → check và AI nhận đúng ngữ cảnh file.

## Vấn đề tìm thấy
1. Route `/chat/$threadId` đang gọi `useSidebar()` và render `SidebarTrigger`, nhưng khi đi từ `/inbox` layout đang ở chế độ chromeless không bọc `SidebarProvider`.
2. Console đang có lỗi runtime: `useSidebar must be used within a SidebarProvider.` Lỗi này có thể làm thread crash trước khi effect `autostart` đọc `sessionStorage` key `__attach:h:<handoff>` và gọi `runAssistant(...)`.
3. Luồng handoff hiện dựa vào `sessionStorage`; nếu route crash/remount hoặc event resolve xảy ra lệch nhịp, payload dễ bị mất dù metadata file vẫn còn.

## Kế hoạch sửa
1. **Làm chat thread chạy được trong mọi layout**
   - Bỏ dependency bắt buộc vào `useSidebar()` trong `src/routes/_app/chat.$threadId.tsx`.
   - Thay `SidebarTrigger` bằng nút local chỉ dispatch `chat-sidebar-toggle` cho chat history, không cần `SidebarProvider`.
   - Việc đóng app sidebar khi `autostart` chỉ thực hiện an toàn khi provider tồn tại, hoặc bỏ hẳn để không crash.

2. **Ổn định handoff file attach từ ChatDock**
   - Giữ cơ chế `handoffId` độc lập với temp/real threadId.
   - Bổ sung helper đọc attachment theo thứ tự ưu tiên:
     - `__attach:h:<handoff>`
     - `__attach:<threadId>`
     - với optimistic thread, fallback thêm key handoff còn tồn tại nếu có.
   - Chỉ remove stash sau khi parse JSON thành công và đã truyền vào `runAssistant`.

3. **Chặn chạy assistant khi metadata có file nhưng payload base64 chưa sẵn sàng**
   - Trong autostart, nếu user message có metadata attachments nhưng chưa lấy được full payload base64, hiển thị lỗi rõ ràng và không gọi AI với attachment metadata rỗng.
   - Như vậy không còn tình trạng AI trả lời “không thấy nội dung file”.

4. **Đảm bảo gửi trong thread hiện tại vẫn hoạt động**
   - Giữ `handleAttach` trong thread dùng payload trực tiếp qua `sendUserMessage(..., payloads)`.
   - Dọn stash thread-local sau khi dùng để tránh gửi lặp.

5. **Xác minh**
   - Kiểm tra lại bằng console/runtime signal: không còn lỗi `useSidebar must be used within a SidebarProvider`.
   - Kiểm tra luồng logic: ChatDock attach 1 file → tạo temp thread → navigate với `handoff` → thread đọc đúng full payload → stream parseDocument xuất hiện.