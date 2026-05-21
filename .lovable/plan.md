## Vấn đề

Hiện tại flow ChatDock → ChatThread cảm giác "lag 3-5 giây" vì tuần tự:

1. User bấm Enter / drop file → `setLoading(true)` → composer bị disable, vẫn ở trang cũ.
2. Upload file (`uploadAttachmentFn`) ~1-2s — chỉ thấy toast.
3. `createThreadWithFirstMessage` ~0.5-1s — vẫn trang cũ.
4. `navigate(/chat/$threadId)` → màn hình **trắng** vài trăm ms (route mount).
5. `ChatSkeleton` chung chung hiện ra (bubble ảo).
6. `getThread` query → mới thấy bubble user thật + stream chạy.

→ User trải qua: **disable → trống → skeleton lạ → mới có nội dung**. Mỗi bước là một "hiccup".

## Mục tiêu UI

Cảm giác **tức thì + liền mạch**: bấm gửi là thấy ngay bubble user của mình + file card + assistant "đang suy nghĩ", chuyển vào thread trông như cùng một màn hình "phình to ra" — không có flash trắng, không có skeleton lạ.

## Thiết kế UI mới

### 1. Optimistic navigation — điều hướng trước, làm việc nặng sau

Đổi thứ tự trong `ChatDock`:

```text
Trước:  [upload file] → [create thread] → navigate → render
Sau:    navigate ngay (threadId client-gen) → render optimistic
        ↓ song song
        upload file + create thread (background)
```

- Sinh `threadId = crypto.randomUUID()` ở client.
- Prime React Query cache `["chat", "thread", threadId]` với một thread "pending" + 1 user message (content + attachments metadata, chưa có uploadId).
- `navigate({ to: "/chat/$threadId", search: { autostart: "1", pending: "1", handoff } })` **ngay lập tức**, không chờ.
- Background `Promise.all([uploadAttachmentFn, createWithMsgFn])` chạy song song; khi xong, patch cache với `uploadId` thật và trigger `runAssistant`.
- Nếu thất bại → toast lỗi + nút "Thử lại" trong chính khung thread, không rollback navigate.

### 2. Optimistic state ở `chat.$threadId.tsx`

Khi `search.pending === "1"` và cache có thread placeholder:

- **Không** hiện `ChatSkeleton` chung. Render thẳng:
  - Bubble user (phải) với nội dung + file card "đang lưu…" (spinner nhỏ chèn vào góc card thay vì toast).
  - Bubble assistant (trái) trống với 3 dấu chấm pulse "Đang chuẩn bị trợ lý kế toán…".
- Composer ở dưới: enabled ngay, placeholder "Có thể hỏi tiếp khi AI đang trả lời…" — user gõ câu thứ 2 sẽ được queue (không block).
- Khi background tasks hoàn tất, swap "đang lưu" → checkmark xanh fade-in 200ms, rồi assistant bắt đầu stream → 3 chấm biến thành text typing.

### 3. View transition giữa dock và thread

Dùng [`startViewTransition`](https://developer.mozilla.org/en-US/docs/Web/API/Document/startViewTransition) (fallback gracefully nếu không có):

- Composer ở dock có `style={{ viewTransitionName: 'chat-composer' }}`.
- Composer trong thread cũng cùng `viewTransitionName: 'chat-composer'`.
- Khi navigate, browser tự morph composer từ dock (sticky bottom) → thread (bottom của panel). User thấy đúng cái composer mình vừa gõ "trượt vào" thread page, không có flash.
- File card optimistic dùng `viewTransitionName: 'attach-{name}'` để cũng morph từ vị trí composer attachment lên bubble user.

Nếu trình duyệt không hỗ trợ → vẫn navigate bình thường (đã đủ nhanh nhờ optimistic).

### 4. Loại bỏ "màn trắng" route mount

- Trong `_app/chat.$threadId.tsx`, **không** đợi `query.isLoading` trước khi render shell. Render thẳng layout (header + scroll area rỗng + composer). Chỉ trong scroll area mới conditional:
  - Có optimistic data → render bubbles ngay.
  - Có query data → render bubbles thật.
  - Cả hai đều chưa có (case hiếm: F5 trực tiếp) → mới hiện `ChatSkeleton`.
- Prefetch `getThread` ngay khi user **focus vào composer dock** (`onFocus` → `qc.prefetchQuery`) — không phải đợi sau navigate.

### 5. Micro-interactions trong thread

- **"Đang suy nghĩ" indicator** thay 3 chấm tĩnh hiện tại bằng:
  - 3 chấm nảy `animate-bounce` lệch pha 120ms — giống Apple Messages.
  - Kèm 1 dòng status thay đổi theo phase: "Đang đọc file đính kèm…" → "Đang tra cứu sổ kế toán…" → "Đang soạn câu trả lời…" (map từ `tool-progress` event).
- **Bubble user fade-in slide-up 180ms** khi mới xuất hiện (CSS `@starting-style` hoặc framer-motion nhỏ).
- **File card** trong bubble user: skeleton shimmer cho khung "đang parse", khi parse xong morph thành `InvoiceExtractCard` thật với crossfade 200ms.
- **Auto scroll**: smooth scroll xuống bubble assistant mới khi stream bắt đầu, KHÔNG scroll trong khi typing để user còn đọc được.

### 6. Composer khi chuyển trang

- Giữ giá trị `input` qua sessionStorage (đã làm).
- Khi route mount thread, nếu `pending` mode → composer **không** disable; chỉ submit button đổi thành spinner nhẹ trong 200ms đầu.
- Bỏ luôn `setLoading(true)` ở dock cho path "có thread mới" — vì navigate đã xảy ra, dock không còn visible.

## Phạm vi file thay đổi

1. `src/components/chat/chat-dock.tsx`
   - `openPersistedThread`: navigate trước (UUID client-gen), tasks chạy nền.
   - `handleAttach`: tương tự — không await trước navigate. Toast "Đang lưu" được thay bằng inline indicator trong thread.
   - Thêm `viewTransitionName` cho composer wrapper.

2. `src/routes/_app/chat.$threadId.tsx`
   - Đọc `search.pending`. Khi có:
     - Skip `ChatSkeleton`, render optimistic từ cache.
     - Hiển thị "thinking dots" assistant placeholder + status string từ tool-progress.
   - `autostart` effect: chờ cache có user message thật rồi mới `runAssistant` (poll cache mỗi 80ms hoặc dùng query subscription).

3. `src/lib/chat-threads.functions.ts`
   - `createThreadWithFirstMessage` nhận thêm optional `threadId` để dùng UUID client-gen → server `INSERT` với id đó (nếu trùng → 409 → fallback random). Cho phép cache key ổn định giữa dock và thread.

4. `src/components/chat/chat-skeleton.tsx`
   - Thêm export `ThinkingBubble` (3 chấm nảy + status text prop).

5. `src/components/chat/message-list.tsx` (xem qua, có thể cần)
   - Hỗ trợ bubble user "pending" (badge nhỏ "đang lưu") và bubble assistant rỗng nhận `statusText` prop.

6. `src/hooks/use-view-transition.ts` (mới, ~15 dòng)
   - Wrapper `withViewTransition(fn)` — gọi `document.startViewTransition(fn)` nếu có, không thì gọi thẳng.

## Không làm trong scope này

- Không đổi `askAccountingStream` / parse-document backend.
- Không đổi schema DB (chỉ thêm tham số optional cho create function).
- Không đổi auth, không đổi chat history popover.

## Kết quả mong đợi

- Bấm gửi → < 50ms thấy thread page với bubble user + composer của mình (morph mượt từ dock).
- Spinner "đang lưu file" hiện ngay trong bubble user, không phải toast nổi.
- Assistant "đang suy nghĩ" thay vì màn trắng / skeleton bubble lạ.
- File upload + create thread chạy ngầm; user có thể gõ tiếp ngay.
- Tổng cảm giác latency giảm từ ~3-5s "bị treo" → < 100ms "phản hồi tức thì".
