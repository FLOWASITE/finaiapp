## Mục tiêu
Ẩn hoàn toàn lớp sidebar/slide nền còn lộ phía sau SlideChat, đặc biệt trên mobile/tablet khi mở lịch sử chat.

## Kế hoạch sửa
1. **Sửa điều kiện nhận diện route chat trong `src/routes/_app.tsx`**
   - Đổi `onChatRoute = location.pathname.startsWith("/chat")` thành điều kiện chặt hơn: `pathname === "/chat" || pathname.startsWith("/chat/")`.
   - Đảm bảo mọi route `/chat` và `/chat/:threadId` đều dùng layout tối giản, không render `AppSidebar`, không render header app, không render `ChatDock`.

2. **Sửa layout SlideChat trong `src/routes/_app/chat.tsx`**
   - Với mobile: khi Sheet lịch sử chat mở, đảm bảo chỉ có **Sheet** hiển thị, không còn “desktop ThreadList”/nền sidebar nào chen phía sau.
   - Tăng tính cô lập lớp Sheet bằng width và z-index đúng, giữ nội dung chat không tạo thêm cột sidebar ẩn.

3. **Sửa `ThreadList` nếu cần**
   - Đảm bảo footer cố định nằm trong đúng sidebar chat.
   - Không để phần collapsed/sidebar mini vẫn chiếm/hiện khi đang dùng Sheet mobile.

4. **Kiểm tra lại bằng preview**
   - Kiểm tra `/chat` ở viewport hiện tại khoảng `707x662`.
   - Kiểm tra desktop rộng hơn để chắc chắn vẫn chỉ có một sidebar Fin Chat.

## Kết quả mong đợi
```text
Mobile / tablet khi mở lịch sử:
[ Sheet SlideChat ] phủ lên nội dung chat, không lộ sidebar thứ 2 phía sau

Desktop:
[ ThreadList Fin Chat | Khung chat ] không có AppSidebar
```