# Fix nút ☰ Fin Chat trên mobile

## Vấn đề
- `ChatHeader` đã render nút ☰ (`PanelLeft`), nhưng trên mobile `ThreadList` luôn chiếm 256px bên trái → header bị đẩy khỏi vùng nhìn, người dùng tưởng "không có nút ☰".
- Bấm ☰ hiện chỉ thu rail còn 56px (vẫn chiếm chỗ), không phải hành vi Gemini mobile.

## Hành vi mục tiêu
- **Mobile (< 768px)**: `ThreadList` ẩn mặc định. Nút ☰ ở header mở `Sheet` trượt từ trái chứa `ThreadList` (full-height, w-80). Tap thread / tap ra ngoài → đóng Sheet.
- **Desktop (≥ 768px)**: Giữ nguyên như hiện tại — `ThreadList` cố định bên trái, ☰ thu/mở rail (w-64 ↔ w-14), phím tắt `⌘\` vẫn chạy.

## Thay đổi code

### 1. `src/routes/_app/chat.tsx`
- Dùng `useIsMobile()` để rẽ nhánh.
- **Desktop**: render `<ThreadList collapsed onToggle …/>` inline như hiện tại.
- **Mobile**: 
  - State riêng `mobileOpen` (không dùng `localStorage`).
  - Lắng nghe event `chat-sidebar-toggle` (cùng event ☰ phát) → set `mobileOpen=true`.
  - Render `<Sheet open={mobileOpen} onOpenChange={setMobileOpen}>` với `SheetContent side="left" className="w-80 p-0"` chứa `<ThreadList collapsed={false} onNew={…}/>`.
  - Khi điều hướng (route đổi) → tự đóng Sheet.

### 2. `src/components/chat/chat-header.tsx`
- Không cần đổi logic — nút ☰ đã phát event `chat-sidebar-toggle`. Trên mobile, event này sẽ mở Sheet; trên desktop, vẫn toggle rail như cũ.

### 3. `src/components/chat/thread-list.tsx`
- Không sửa logic. Truyền prop để khi click 1 thread trong Sheet sẽ gọi callback đóng Sheet (thêm optional `onItemClick?: () => void` rồi gọi trong `<Link>` onClick).

## Không đụng tới
- `chat.$threadId.tsx`, `chat.index.tsx`, `composer.tsx`, `message-list.tsx`, mode toggle Kế toán/AI, business logic, thread storage.
