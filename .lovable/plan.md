# Lưu & hiển thị lịch sử chat theo từng InboxItem

## Mục tiêu

Mỗi InboxItem (nhận diện theo `external_id`) có **một thread chat riêng**. Khi mở Sheet của item, hiển thị lại các tin nhắn cũ. Khi user bấm "Hỏi AI về mục này", mở đúng thread đó (thay vì tạo thread mới mỗi lần).

## Schema thay đổi

Thêm cột vào `chat_threads`:

- `inbox_external_id text` — nullable
- `kind text` default `'general'` (giá trị: `'general' | 'inbox'`) — để phân biệt thread sinh từ inbox với chat thường, tránh làm rối danh sách "Lịch sử" của ChatDock
- Partial unique index `(tenant_id, user_id, inbox_external_id) WHERE inbox_external_id IS NOT NULL` — đảm bảo 1 thread / item / user.

RLS hiện tại đã đủ (cùng tenant + user_id). Không đổi `chat_messages`.

## Server functions mới (`src/lib/chat-threads.functions.ts`)

- `getOrCreateInboxThread({ externalId, title })` — SELECT theo `(tenant_id,user_id,inbox_external_id)`; nếu chưa có thì INSERT với `kind='inbox'`, `title` = title của item; trả về `ChatThread`.
- `listThreads` cập nhật để **lọc mặc định `kind='general'`** (giữ ChatDock history sạch). Thêm tham số tuỳ chọn `kind?: 'inbox' | 'general' | 'all'`.

`appendMessage`, `getThread` giữ nguyên.

## UI: `InboxItemSheet`

Khi `item` mở:

1. Gọi `getOrCreateInboxThread({ externalId: item.external_id, title: item.title })` (useQuery, key `["inbox-thread", external_id]`).
2. Khi có `threadId`, `useQuery(getThread)` lấy messages.
3. Thêm khối **"Lịch sử trao đổi với AI"** ngay phía trên nút "Hỏi AI về mục này":
   - Empty state: "Chưa có trao đổi nào. Bấm 'Hỏi AI về mục này' để bắt đầu."
   - Danh sách bubble (user phải, assistant trái, system dạng chip nhỏ), max-height + scroll trong khu vực body của Sheet.
   - Footer nhỏ "Mở cuộc trò chuyện đầy đủ →" → `navigate({ to: '/chat/$threadId', params: { threadId } })`.
4. Nút **"Hỏi AI về mục này"** đổi hành vi:
   - Nếu thread rỗng: append message user prefill (`Về mục "..."`) rồi navigate sang `/chat/$threadId` với `search: { autostart: '1' }` để route xử lý streaming và lưu assistant reply.
   - Nếu thread đã có message: chỉ navigate sang `/chat/$threadId` (không autostart) để user tiếp tục gõ — ChatDock/route hiện tại đã xử lý dock send + lưu.
5. Sau khi quay về Inbox và mở lại Sheet → useQuery tự fetch lại, hiển thị toàn bộ lịch sử bao gồm reply mới.

Không thay đổi luồng `Approve/Skip/Edit/Rule` và không động vào ChatDock / route `/chat/$threadId`.

## Cân nhắc

- **Stable id**: dùng `external_id` (đã ổn định trong `InboxItem`), không dùng `item.id` vì id này được sinh lại.
- **Không tự tạo thread khi chỉ xem**: thật ra `getOrCreateInboxThread` được gọi khi mở Sheet → có thể tạo thread rỗng. Để tránh rác: chuyển thành **`getInboxThread`** (chỉ SELECT) khi mở Sheet; chỉ gọi create lần đầu khi user thực sự bấm "Hỏi AI". Lúc đó empty state hiển thị "Chưa có trao đổi".
- **listThreads filter**: phải cập nhật vì ChatDock dùng `listThreads()` cho lịch sử — nếu không lọc, các thread Inbox sẽ tràn vào popover.

## Technical details

```text
src/lib/chat-threads.functions.ts
  + getInboxThread({ externalId })        → ChatThread | null
  + getOrCreateInboxThread({ externalId, title }) → ChatThread
  ~ listThreads(kind?)                     → mặc định kind='general'

src/components/inbox/inbox-item-sheet.tsx
  + useQuery getInboxThread(item.external_id)
  + useQuery getThread(threadId) khi có
  + Render <InboxChatHistory messages={...} />
  ~ Nút "Hỏi AI về mục này": getOrCreate → appendMessage(user prefill) → navigate /chat/$threadId

migration:
  ALTER TABLE chat_threads
    ADD COLUMN inbox_external_id text,
    ADD COLUMN kind text NOT NULL DEFAULT 'general';
  CREATE UNIQUE INDEX chat_threads_inbox_unique
    ON chat_threads(tenant_id, user_id, inbox_external_id)
    WHERE inbox_external_id IS NOT NULL;
  CREATE INDEX chat_threads_kind_idx ON chat_threads(tenant_id, user_id, kind);
```

## Out of scope

- Không thêm AI streaming trong Sheet (giữ ở `/chat/$threadId`).
- Không đổi UI ChatDock.
- Không xoá / migrate các thread cũ.
