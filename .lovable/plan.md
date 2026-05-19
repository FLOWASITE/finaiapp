## Mục tiêu
Thêm nút **Collapse/Expand** (đóng/mở) cho sidebar lịch sử chat ở trang `/chat`, để người dùng có thêm không gian khi cần.

## Thay đổi

### 1. `src/components/chat/thread-list.tsx`
- Đổi `ThreadList` để nhận thêm props `collapsed: boolean` và `onToggle: () => void`.
- Khi `collapsed = true`:
  - Sidebar thu hẹp còn `w-14` (chỉ hiển thị icon).
  - Ẩn tiêu đề "Trợ lý kế toán", nút "Cuộc trò chuyện mới" hiển thị dưới dạng icon `+`.
  - Ẩn danh sách bucket/threads (hoặc hiển thị icon `MessageSquare` mini list, tuỳ tinh gọn).
  - Thêm nút toggle (icon `PanelLeftOpen`) ở đầu sidebar.
- Khi `collapsed = false`:
  - Giữ nguyên layout hiện tại, thêm nút toggle (icon `PanelLeftClose`) ở header cạnh logo, có tooltip "Ẩn lịch sử (Cmd+\\)".

### 2. `src/routes/_app/chat.tsx`
- Quản lý state `collapsed` qua `useState` + persist `localStorage` key `chat:sidebar-collapsed`.
- Truyền `collapsed` và `onToggle` xuống `ThreadList`.
- Thêm phím tắt `Cmd/Ctrl + \` để toggle.

### 3. Out of scope
- Không thay đổi logic dữ liệu, server functions, hay UX bên trong từng thread.
- Không đụng ChatDock ở các trang khác.

## Chi tiết kỹ thuật
- Icon: `PanelLeftClose` / `PanelLeftOpen` từ `lucide-react`.
- Transition: `transition-[width] duration-200` để mượt.
- Persist: đọc `localStorage` khi mount (guard `typeof window`), ghi mỗi khi đổi.
