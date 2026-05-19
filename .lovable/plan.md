# Ẩn header khi click nút thu gọn sidebar chat

## Mục tiêu
Khi người dùng bấm nút thu gọn (nút khoanh đỏ trong sidebar "Trợ lý kế toán"), ngoài việc thu gọn cột danh sách hội thoại như hiện tại, **header phía trên** (chứa nút sidebar app, tenant switcher, breadcrumb "Trang chủ › Trợ lý AI › #fb4a520f") cũng sẽ ẩn đi — tạo chế độ chat toàn màn hình, tập trung.

Bấm lại nút đó (hoặc Ctrl/Cmd + \\) sẽ hiện header trở lại.

## Phạm vi
- Chỉ áp dụng cho các route bắt đầu bằng `/chat` (trang Trợ lý AI). Các trang khác không bị ảnh hưởng.
- Trạng thái thu gọn được lưu sẵn ở `localStorage["chat:sidebar-collapsed"]` — dùng lại key này, không thêm state mới.

## Thay đổi kỹ thuật

**1. `src/hooks/use-chat-sidebar-collapsed.ts` (mới)**
- Hook nhỏ đọc `localStorage["chat:sidebar-collapsed"]` và lắng nghe sự kiện `chat-sidebar-toggle` để cập nhật state realtime giữa các component cùng cây.

**2. `src/routes/_app/chat.tsx`**
- Trong hàm `toggle()`, sau khi `setItem` localStorage, `window.dispatchEvent(new Event("chat-sidebar-toggle"))` để báo cho `_app.tsx` biết.

**3. `src/routes/_app.tsx`**
- Dùng `useChatSidebarCollapsed()`.
- Nếu `onChatRoute && collapsed === true` → không render khối `<header>` và `<PageBreadcrumbs />`. Giữ nguyên `<Outlet />` để ThreadList + nút mở lại (PanelLeftOpen) vẫn hiện.
- Đảm bảo chiều cao `chat-surface` (`h-[calc(100vh-7rem)]`) vẫn đúng khi không có header — có thể chuyển sang `flex-1` của `<main>` (đã `overflow-auto`) nên thực tế không cần đổi class chat-surface; nếu cần sẽ dùng class điều kiện.

## Không thay đổi
- Logic chat, stream, RLS, server functions.
- Hành vi sidebar ThreadList ngoài việc phát thêm event.
- Các route ngoài `/chat`.
