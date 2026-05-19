# Tách độc lập 2 sidebar trong AI mode

## Mục tiêu
Trong trang `/chat` (AI mode), người dùng có thể đóng/mở **AppSidebar** (nav trái) và **ThreadList** (lịch sử chat) một cách độc lập, không bị gộp chung.

## Hiện trạng (vấn đề)
- File `src/routes/_app.tsx`: biến `hideChrome = onChatRoute && chatSidebarCollapsed` → khi đóng ThreadList thì **ẩn luôn AppSidebar + header** (full-screen chat).
- File `src/routes/_app/chat.tsx`: khi `collapsed` cũng bỏ luôn padding/border của khung chat (`h-screen rounded-none border-0`).
- Kết quả: 1 nút Cmd+\ điều khiển cả 2 thứ → không linh hoạt.

## Thay đổi

### 1. `src/routes/_app.tsx`
- **Xoá** logic `hideChrome` cũ. Header và AppSidebar **luôn hiển thị** trong `/chat` (giống các route khác).
- Vẫn giữ `ChatDock` chỉ hiện ngoài `/chat`.

### 2. `src/routes/_app/chat.tsx`
- Bỏ biến thể `h-screen rounded-none border-0` khi collapsed. Khung chat luôn dùng `h-[calc(100vh-7rem)] rounded-2xl` vì giờ header luôn hiển thị.
- Vẫn truyền `collapsed` + `onToggle` xuống `ThreadList` để nút đóng/mở ThreadList hoạt động độc lập.
- Có thể xoá phần `useEffect` đăng ký phím tắt Cmd+\ (theo yêu cầu không cần phím tắt) — hoặc giữ lại cũng được. Sẽ **xoá** cho gọn.

### 3. `src/components/app-sidebar.tsx` / sử dụng `SidebarTrigger`
- AppSidebar đã hỗ trợ `collapsible` qua `SidebarProvider`. Nút `SidebarTrigger` sẵn có trong header (`src/routes/_app.tsx` đã render `<SidebarTrigger />`).
- Không cần đổi gì — chỉ cần header luôn hiển thị (đã làm ở bước 1) là người dùng có nút độc lập để đóng/mở AppSidebar.

### 4. Dọn dẹp
- Hook `useChatSidebarCollapsed` và file `src/hooks/use-chat-sidebar-collapsed.ts` vẫn dùng cho ThreadList state — giữ nguyên.
- Import `useChatSidebarCollapsed` trong `_app.tsx` không còn cần — xoá.

## Kết quả UX
- Ở `/chat`: header + AppSidebar luôn hiện (giống các trang khác). Có 2 nút độc lập:
  - `SidebarTrigger` trong header → đóng/mở AppSidebar (nav trái).
  - Nút PanelLeftClose/Open trong ThreadList → đóng/mở lịch sử chat.
- 4 tổ hợp trạng thái đều khả dĩ.

## Phạm vi
Chỉ chỉnh layout/route files, không động vào logic chat/business.
