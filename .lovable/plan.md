## Mục tiêu
Khi vào route `/chat` (Fin Chat), ẩn hoàn toàn header của app (thanh có SidebarTrigger + TenantSwitcher + AppHeader) để chat chiếm full chiều cao, không phụ thuộc trạng thái collapse của sidebar chat.

## Thay đổi

**`src/routes/_app.tsx`**
- Hiện tại: `const hideHeader = onChatRoute && chatHistoryCollapsed;` → header chỉ ẩn khi sidebar chat collapsed.
- Sửa thành: `const hideHeader = onChatRoute;` → luôn ẩn header khi ở bất kỳ route `/chat/*`.
- Xoá import `useChatSidebarCollapsed` nếu không còn nơi nào dùng trong file này.

## Tác động
- Desktop & mobile: vào Fin Chat sẽ không thấy thanh header app phía trên nữa. Điều hướng/tenant/notifications được truy cập qua nút ☰ của ChatHeader (mở sidebar chat) hoặc rời route `/chat`.
- Các route khác giữ nguyên header.

## Không thay đổi
- ChatHeader, ThreadList, layout chat hiện tại.
- Sidebar app (`AppSidebar`) vẫn render nhưng ẩn theo logic hiện có; không đụng tới.
