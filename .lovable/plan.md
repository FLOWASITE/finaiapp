# Đổi nút "Quay lại" thành toggle AppSidebar + header trong suốt

## Thay đổi

### `src/routes/_app/chat.$threadId.tsx`
1. **Thay nút "Quay lại"** bằng `<SidebarTrigger />` (từ `@/components/ui/sidebar`) — điều khiển AppSidebar (nav trái chính), giống nút trong header toàn app. Icon panel trái, click để đóng/mở AppSidebar.
2. **Header trong suốt**: bỏ `bg-background/60 backdrop-blur-xl`, đổi `bg-transparent`. Bỏ luôn `border-b border-border/40` để tin nhắn liền mạch phía sau.
3. **Dọn dẹp**: xoá `ArrowLeft` import nếu không còn dùng. Giữ `from`/`router` logic nếu nơi khác trong file còn dùng — kiểm tra trước khi xoá.

## Phạm vi
1 file: `src/routes/_app/chat.$threadId.tsx`.
