## Bối cảnh

Tại `/inbox` (ChatDock, chưa có thread), khi đính kèm file + gõ text rồi gửi:
- Tin nhắn user lưu vào DB với `content = note (text)` và `metadata.attachments = [...]`.
- Server function `askAccountingStream` nhận `question = note` và `attachments = [...]` riêng, rồi ghép vào prompt cuối qua `attachmentBlock`.

Nhưng UI tin nhắn user (message-list) **không render** `metadata.attachments` → người dùng nhìn chat thấy chỉ có text (hoặc chỉ có file-summary nếu không gõ text), tưởng là "AI mất 1 trong 2". Bên cạnh đó, do `content` chỉ chứa note thuần, nếu autostart race khiến `__attach:${tempId}` bị xoá trước khi đọc (ví dụ remount), thì AI sẽ chỉ nhận text — file thực sự bị mất.

## Mục tiêu

1. UI hiển thị đầy đủ cả text + chip file ngay trên bong bóng tin nhắn của user — không còn ấn tượng "mất 1 trong 2".
2. Đảm bảo cả text lẫn file đều thực sự đi tới server (không phụ thuộc thuần vào sessionStorage stash).
3. Không thay đổi hành vi của các luồng khác (legacy parse → /import/preview, ghi âm, v.v.).

## Phạm vi

Chỉ frontend / presentation. Không đụng `chat.functions.ts`, không đụng DB, không đụng RLS.

## Thay đổi

### 1. `src/components/chat/message-list.tsx` (và/hoặc bong bóng user)
- Khi `message.role === "user"` và `message.metadata?.attachments?.length`, render danh sách chip file ở trên/dưới phần text:
  - Icon (FileText / image preview nếu mime image), tên file, kích thước, đuôi.
  - Style tương tự chip "pending" trong `composer.tsx` (rounded-xl, border-border/60, bg-background/80).
- Nếu `content` rỗng thì vẫn render chip + có thể hiện placeholder mờ "(đã đính kèm)" để bong bóng không trống.

### 2. `src/components/chat/chat-dock.tsx` — `handleAttach`
- Giữ `content = note (nếu có)` để question gửi server không bị "ô nhiễm" bằng file-summary.
- Vẫn lưu `metadata.attachments` như hiện tại (đã có) để chip render được ở bước (1).
- Không đổi server contract.

### 3. `src/routes/_app/chat.$threadId.tsx`
- Trong `messages` mapping (line ~165) và trong `sendUserMessage` (line ~384): bổ sung `metadata` vào `ChatMsg` để chip hiển thị cả cho tin nhắn vừa gửi (optimistic) lẫn tin tải từ DB.
- Type `ChatMsg` cần thêm `metadata?: { attachments?: Array<{name; mime; size; kind}> }`.

### 4. Phòng race attachments stash (an toàn nhẹ)
- Trong `chat-dock.tsx > startOptimistic`: stash payloads vào sessionStorage **trước** khi `qc.setQueryData` + `navigate` (hiện đã đúng — chỉ thêm log/guard).
- Trong `chat.$threadId.tsx` autostart effect: nếu `pendingAttachments` undefined nhưng `msgs[0].metadata?.attachments?.length`, hiển thị toast "Đã mất nội dung file đính kèm, vui lòng gửi lại" để người dùng không bị bối rối thay vì nghĩ "AI lờ file".

## Out of scope

- Không thay đổi `askAccountingStream` (server đã đúng).
- Không refactor composer chip path.
- Không thay đổi luồng /chat/$threadId composer (đã đúng path qua `sendUserMessage`).

## Kiểm thử nhanh sau khi build

1. /inbox → Paperclip → chọn 1 PDF → gõ "xem hộ" → Send.
2. Quan sát: bong bóng user hiện đủ "xem hộ" + chip PDF.
3. AI phản hồi đề cập tới nội dung file (không phải greeting chung).
4. Lặp lại với: chỉ file (không text) → hiện chip + placeholder; chỉ text → như cũ.
