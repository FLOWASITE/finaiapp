## Mục tiêu
Khi user gửi tin nhắn ở ChatDock (ở `/inbox` hay bất kỳ trang nào) và nhảy sang `/chat/:threadId`, trên Desktop tự động:
- **Đóng** sidebar chính (Mode AI / `AppSidebar`).
- **Mở** sidebar History (`ThreadList`).

Mobile giữ nguyên hành vi hiện tại (cả 2 sidebar đều dạng overlay/offcanvas, không auto-toggle).

## Hiện trạng
- `src/routes/_app.tsx` bọc app bằng `SidebarProvider` (shadcn) → điều khiển `AppSidebar`. Trạng thái lưu cookie `sidebar:state` và qua hook `useSidebar()`.
- `src/routes/_app/chat.tsx` quản lý `ThreadList` qua `localStorage["chat:sidebar-collapsed"]` + event `chat-sidebar-toggle` (hook `useChatSidebarCollapsed`).
- ChatDock điều hướng sang `/chat/:tempId?autostart=…&from=…`. Hiện không chạm 2 trạng thái sidebar.

## Thay đổi (chỉ FE/UI)

### 1. `src/routes/_app/chat.$threadId.tsx`
- Import `useSidebar` từ `@/components/ui/sidebar` và `useIsMobile` từ `@/hooks/use-mobile` (nếu có; nếu không dùng `window.matchMedia("(min-width: 768px)")`).
- Trong `useEffect` chạy 1 lần khi mount thread page:
  - Nếu **desktop** (md trở lên) **và** `autostart` search param có giá trị (tức vừa từ ChatDock sang):
    - Gọi `setOpen(false)` để đóng `AppSidebar`.
    - Set `localStorage["chat:sidebar-collapsed"] = "0"` và dispatch `new Event("chat-sidebar-toggle")` để mở History.
  - Không đụng tới state khi mobile, hoặc khi user mở thread trực tiếp (không có `autostart`) — tôn trọng lựa chọn trước đó.

### 2. Không đổi
- ChatDock, ThreadList, layout `_app`, layout `chat.tsx` giữ nguyên. User vẫn có thể bấm `SidebarTrigger` để mở lại AppSidebar, hoặc toggle History bằng `Ctrl/Cmd+\` như cũ.

## Out of scope
- Không đổi logic gửi tin / attachments.
- Không đổi mobile UX.
- Không persist "chat mode layout" như một preference riêng — chỉ auto-set 1 lần khi vào từ ChatDock.