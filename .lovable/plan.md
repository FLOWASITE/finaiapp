# Ẩn header trong /chat khi đóng lịch sử chat

## Mục tiêu
Khi `ThreadList` (lịch sử chat) đang collapsed, ẩn header để khung chat dùng được toàn bộ chiều cao. Khi mở lại lịch sử, header hiện trở lại.

## Thay đổi

### `src/routes/_app.tsx`
- Đọc lại `useChatSidebarCollapsed` (import lại hook).
- Tính `hideHeader = onChatRoute && chatSidebarCollapsed`.
- Header chỉ render khi `!hideHeader`.
- AppSidebar vẫn luôn mount (vẫn toggle độc lập qua `SidebarRail` của shadcn — rail nằm cạnh sidebar, không phụ thuộc header).

### `src/routes/_app/chat.tsx`
- Khi `collapsed`: khung chat dùng `h-screen rounded-none border-0` (full màn hình, không có header phía trên).
- Khi không collapsed: giữ `h-[calc(100vh-7rem)] rounded-2xl` (chừa chỗ cho header).

## UX kết quả
- Mở ThreadList: header hiện, khung chat bo góc, AppSidebar toggle bằng `SidebarTrigger` trong header.
- Đóng ThreadList: header ẩn, chat full màn hình, AppSidebar toggle bằng rail (kéo cạnh trái sidebar) hoặc mở lại ThreadList trước.

## Phạm vi
2 file: `src/routes/_app.tsx` và `src/routes/_app/chat.tsx`.
