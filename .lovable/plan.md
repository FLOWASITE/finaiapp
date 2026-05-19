## Vấn đề

Khi user gửi câu hỏi từ ChatDock ở footer, flow hiện tại tuần tự nặng:

1. ChatDock đợi `createThreadWithFirstMessage` xong (server làm **3** truy vấn Supabase: insert thread → insert message → update `last_message_at`).
2. Navigate sang `/chat/$threadId?autostart=1`.
3. Trang thread mount, chạy `getThread` — **fetch lại chính thread vừa tạo** → trong lúc đó hiện full‑screen spinner "Đang tải hội thoại…".
4. Khi `query.data` về, effect autostart mới chạy → mới bắt đầu stream AI.

Tổng cộng: ~2 round‑trip tuần tự + 1 màn hình trắng spinner trước khi AI bắt đầu nói. Đây là nguyên nhân chính gây cảm giác lag.

## Mục tiêu

Khi user gửi câu hỏi, trong vòng 1 frame sau click họ phải thấy:
- Tin nhắn của mình đã hiện trong khung chat
- Bong bóng assistant đang gõ chữ
- Stream AI bắt đầu chảy

Không còn màn hình spinner "Đang tải hội thoại…", không còn đợi getThread.

## Cách làm

### 1. Prime React Query cache ngay khi tạo thread (`src/components/chat/chat-dock.tsx`)

Sau khi `createThreadWithFirstMessage` trả về `{ thread, message }`:

- `qc.setQueryData(["chat","thread", thread.id], { thread, messages: [message] })` → khi trang thread mount, `useQuery` đọc từ cache, `isLoading = false`, không refetch (đã có `staleTime: 30s`).
- `qc.setQueryData(["chat","threads","recent","all"], prev => [thread, ...(prev ?? [])])` → sidebar/popover history hiện ngay thread mới mà không cần invalidate.

### 2. Bỏ full‑screen loader "Đang tải hội thoại…" (`src/routes/_app/chat.$threadId.tsx`)

- Thay vì `if (query.isLoading) return <Spinner/>`, render khung chat ngay với `messages = query.data?.messages ?? []` (hoặc localMsgs). Giữ spinner nhỏ inline ở chỗ messages khi thực sự rỗng + đang loading + không có autostart.
- Khi đến từ ChatDock thì cache đã prime ở bước 1 → render ngay user message + empty assistant bubble, không bao giờ thấy spinner.

### 3. Stream AI không đợi `query.data` (`src/routes/_app/chat.$threadId.tsx`)

Sửa effect autostart: trigger ngay khi có `autostart` và có ít nhất 1 user message (lấy từ cache đã prime), không đợi `query.isLoading === false`. Đảm bảo `startedRef` chống chạy 2 lần.

### 4. Bỏ 1 query DB thừa khi tạo thread (`src/lib/chat-threads.functions.ts`)

Trong `createThreadWithFirstMessage`:
- Bỏ hẳn `UPDATE chat_threads SET last_message_at = now()` (query thứ 3). Set `last_message_at` ngay trong câu `INSERT` đầu tiên (`insert({ ..., last_message_at: new Date().toISOString() })`) → cắt 1 round‑trip Supabase mà vẫn đúng dữ liệu.

### 5. (Tuỳ chọn nhỏ) Optimistic UX ở dock

- Khi `setLoading(true)`, nút gửi đổi sang spinner cùng disabled — hiện đã có; chỉ kiểm tra Composer hiển thị đúng `loading` ngay frame đầu để user không bấm 2 lần.

## Không thay đổi

- Logic stream `askAccountingStream`, parse attachments, server prompt — giữ nguyên.
- Schema DB — không cần migration.
- Tính năng "Quay lại trang trước", history popover, digest badge — không động vào.

## Kết quả kỳ vọng

- Cắt 1 round‑trip ở server (bước 4) + 1 round‑trip client `getThread` (bước 2) + xoá full‑screen spinner (bước 3).
- Từ lúc bấm Gửi đến lúc thấy stream AI: ~1 round‑trip duy nhất (đợi `createThreadWithFirstMessage`) thay vì 2 + spinner.

## Tệp sẽ sửa

- `src/components/chat/chat-dock.tsx`
- `src/routes/_app/chat.$threadId.tsx`
- `src/lib/chat-threads.functions.ts`
