
# Kế hoạch: UI kiểu ChatGPT với composer ở footer

## 1. Composer footer toàn app

Thêm thanh nhập chat dính đáy ở mọi trang trong `_app` layout.

- Tạo `src/components/chat-dock.tsx`: thanh nổi (sticky/fixed bottom), centered max-w-3xl, textarea tự co giãn, nút gửi, nút "+" đính kèm, nút mic (placeholder). Style giống ChatGPT: nền `bg-background/80 backdrop-blur` + viền `rounded-2xl` + shadow.
- Gắn vào `src/routes/_app.tsx`: render `<ChatDock />` ngay trong `<SidebarInset>` sau `<main>` (sticky bottom). Ẩn khi route hiện tại đã là `/chat` hoặc `/chat/$threadId` (vì trang chat có composer riêng) để tránh trùng.
- Hành vi gửi:
  - Nếu đang ở `/chat/$threadId` → bị ẩn (không liên quan).
  - Ở các trang khác → tạo thread mới qua server fn `createThread`, lưu tin nhắn đầu, rồi `navigate({ to: "/chat/$threadId", params })`. Trang chat tự stream phản hồi.
- Truyền `pageContext` (route path + một số id nổi bật trong URL) vào `askAccountingStream` để AI biết user đang xem trang nào.

## 2. Trang /chat kiểu ChatGPT (multi-thread, lưu DB)

Cấu trúc layout 2 cột:

```text
+--------------------------------------------+
| Sidebar threads  |  Main conversation       |
| - New chat       |  ┌──────────────────┐   |
| - Today          |  │ Messages stream  │   |
|   • Thread A     |  │                  │   |
|   • Thread B     |  └──────────────────┘   |
| - Previous 7d    |  ┌──────────────────┐   |
|   • Thread C     |  │ Composer footer  │   |
+--------------------------------------------+
```

Routes mới (file-based, flat):
- `src/routes/_app/chat.tsx` → layout chat (sidebar thread list + `<Outlet />`). Trang mặc định hiện empty state + suggestions, gửi tin nhắn đầu sẽ tạo thread mới rồi navigate.
- `src/routes/_app/chat.$threadId.tsx` → màn hội thoại của 1 thread.

Component mới:
- `src/components/chat/thread-list.tsx`: danh sách thread chia nhóm theo thời gian (Hôm nay / 7 ngày trước / 30 ngày trước / Cũ hơn), highlight thread active, nút "+ Cuộc trò chuyện mới", menu đổi tên / xoá.
- `src/components/chat/message-list.tsx`: render bubbles. Assistant không có nền (text trên surface chính), user có bubble `bg-primary text-primary-foreground` bo tròn. Avatar nhỏ. Markdown đơn giản (whitespace-pre-wrap). Indicator "Đang truy vấn dữ liệu…" khi đang stream.
- `src/components/chat/composer.tsx`: dùng chung cho ChatDock và trang chat (textarea auto-grow + Enter gửi / Shift+Enter xuống dòng + nút Send).

Hành vi:
- Mở `/chat` lần đầu: auto chọn thread mới nhất hoặc hiện trang chào.
- Mỗi tin nhắn: optimistic append, stream delta vào assistant bubble, sau khi xong gọi server fn lưu vào DB.
- Đặt tiêu đề thread tự động từ ~40 ký tự đầu của câu hỏi đầu tiên (có thể đổi sau).

## 3. Backend (Lovable Cloud)

Hai bảng mới (sẽ tạo qua migration, scope theo `tenant_id` + `user_id` giống các bảng khác trong dự án):

- `chat_threads`: `id`, `tenant_id`, `user_id`, `title`, `created_at`, `updated_at`, `last_message_at`.
- `chat_messages`: `id`, `thread_id`, `tenant_id`, `user_id`, `role` ('user'|'assistant'), `content`, `created_at`. Index trên `(thread_id, created_at)`.

RLS: chỉ user đang đăng nhập trong cùng tenant mới đọc/ghi được thread + messages của mình.

Server functions mới (`src/lib/chat-threads.functions.ts`):
- `listThreads()` → danh sách thread của user.
- `getThread(threadId)` → metadata + danh sách messages.
- `createThread({ title? })` → trả về thread mới (id, title).
- `renameThread({ threadId, title })`, `deleteThread({ threadId })`.
- `appendMessage({ threadId, role, content })` → insert + update `last_message_at` của thread.
- (Tuỳ chọn) `generateThreadTitle({ threadId, firstQuestion })` chạy nền sau khi assistant trả lời xong, có thể dùng AI để tóm tắt ngắn.

`askAccountingStream` giữ nguyên signature streaming hiện có; chỉ bổ sung optional `threadId` để client có thể truyền để gọn ngữ cảnh nếu cần.

## 4. Caching & UX

- TanStack Query cho `listThreads` (staleTime 60s) và `getThread(threadId)` (staleTime 30s, key theo threadId).
- Sau khi stream xong: `queryClient.invalidateQueries(['chat','threads'])` để sidebar nhảy thread mới lên đầu, và `setQueryData` cho `['chat','thread',id]` với messages mới (không cần fetch lại).
- Auto-focus textarea khi vào thread, sau khi gửi, sau khi switch thread.
- Auto-scroll xuống cuối khi messages thay đổi.
- ChatDock ẩn trên `/chat*` để không bị trùng composer.

## 5. Các thay đổi file (tóm tắt kỹ thuật)

- **New**: `src/components/chat-dock.tsx`, `src/components/chat/thread-list.tsx`, `src/components/chat/message-list.tsx`, `src/components/chat/composer.tsx`, `src/lib/chat-threads.functions.ts`, `src/routes/_app/chat.$threadId.tsx`.
- **Edit**: `src/routes/_app.tsx` (mount ChatDock + ẩn trên /chat*), `src/routes/_app/chat.tsx` (chuyển thành layout 2 cột + thread list), `src/lib/chat.functions.ts` (thêm optional `threadId` param).
- **Migration**: tạo `chat_threads`, `chat_messages` + RLS.

## 6. Nằm ngoài phạm vi (sẽ làm sau nếu cần)

- Đính kèm file/ảnh trong chat.
- Tìm kiếm thread.
- Chia sẻ link thread công khai.
- Voice input thật (chỉ để icon placeholder).
