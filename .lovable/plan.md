Mình sẽ refactor phần layout chat cũ thay vì vá tiếp từng chỗ.

## Mục tiêu
- Trên mobile: header đúng dạng `☰ + Fin + nút AI Mode`, nút ☰ luôn nhìn thấy.
- Bấm ☰ mở Sheet trượt từ trái chứa danh sách hội thoại.
- Tắt lỗi lệch render/hydration đang gây React error #418.
- Desktop vẫn có danh sách hội thoại bên trái, có collapse/expand như hiện tại.

## Kế hoạch triển khai
1. **Tách điều khiển sidebar chat khỏi event mơ hồ**
   - Thay cơ chế `chat-sidebar-toggle` dùng chung cho cả desktop collapse và mobile Sheet.
   - Truyền callback trực tiếp từ layout xuống `ChatHeader` qua context/Outlet context để nút ☰ mở Sheet mobile hoặc toggle sidebar desktop đúng ngữ cảnh.

2. **Sửa breakpoint và hydration**
   - Không render khác nhau giữa server và client theo `useIsMobile()` ở lần render đầu.
   - Dùng CSS responsive (`md:`) để desktop sidebar ẩn/hiện ổn định, còn Sheet mobile luôn được mount nhưng chỉ mở khi user bấm.
   - Điều này nhắm trực tiếp lỗi React #418 do text/layout SSR-client không khớp.

3. **Refactor `ChatHeader` đúng layout mới**
   - Mobile: nút icon menu ở trái, text `Fin` ở giữa/trái, AI Mode gọn bên phải.
   - Dùng icon menu rõ ràng hơn thay vì `PanelLeft` nếu cần, giữ aria-label tiếng Việt.
   - Không để header bị che bởi app header/sidebar cũ.

4. **Refactor `ThreadList` cho Sheet trái**
   - Thêm variant/use-case cho mobile Sheet: full height, nền theo theme app, nút đóng mặc định ẩn/không chồng lên nội dung.
   - Bấm hội thoại hoặc tạo mới sẽ tự đóng Sheet.
   - Giữ tìm kiếm/lọc sao/danh sách theo ngày.

5. **Dọn style chat cũ không theo theme**
   - Thay các class hard-code như `text-slate-*`, `bg-white`, `bg-blue-*`, `bg-teal-*` trong vùng chat chính bằng token theme (`background`, `foreground`, `muted`, `primary`, `accent`, `sidebar`).
   - Đảm bảo auto theo light/dark theme.

6. **Kiểm tra lại trên mobile và desktop**
   - Mobile khoảng 390px và viewport hiện tại 707px: xác nhận nút ☰ hiển thị, Sheet trượt trái, chọn hội thoại đóng Sheet.
   - Desktop: xác nhận sidebar trái vẫn hoạt động và không làm mất nội dung chat.