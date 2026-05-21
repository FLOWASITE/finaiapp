
## Mục tiêu

Khi người dùng đang ở trang bất kỳ (Documents, Sales, …) và gõ ở **ChatDock**:
1. Mở thread chat **liền mạch, không có cảm giác refresh / nhảy giật** — tin nhắn xuất hiện ngay, AI bắt đầu trả lời tức thì.
2. Nếu AI đang stream câu trả lời cũ và người dùng gửi câu mới (ở dock hoặc ở composer trong thread), **hủy stream cũ và trả lời ngay câu mới** thay vì hiện toast chặn.

## Hiện tượng đang xảy ra

- ChatDock `submit()` đợi `createThreadWithFirstMessage` (server roundtrip) **rồi mới** `navigate(...)`. Khoảng trống vài trăm ms + thay đổi layout (sidebar app ↔ sidebar chat) ⇒ cảm giác "refresh".
- Trong `chat.$threadId.tsx`, listener `chat:dock-send` thấy `streaming === true` thì **toast "Đang xử lý câu hỏi trước, vui lòng đợi."** và bỏ qua câu mới ⇒ "chatbot không phản hồi".

## Thay đổi (chỉ frontend)

### 1. `src/components/chat/chat-dock.tsx` — Optimistic navigation
- `submit()` (và `handleAttach()` cho file): không `await` create nữa, đổi sang flow:
  1. Sinh `tempId = crypto.randomUUID()`.
  2. Prime cache `["chat","thread", tempId]` với 1 message user tạm thời (`id: temp-...`, role user, content q).
  3. Prime cache list threads (đã làm) với 1 thread tạm `{ id: tempId, title: q.slice(0,60), kind: "general", ... }`.
  4. `collapseChatSidebar()` + `navigate({ to: "/chat/$threadId", params: { threadId: tempId }, search: { autostart: "1", from: fromHref, optimistic: "1" } })` **ngay lập tức**.
  5. Sau đó, song song gọi `createWithMsgFn(...)`:
     - Khi resolve thành công với `res.thread.id !== tempId`: thay cache key `["chat","thread", tempId]` → `["chat","thread", res.thread.id]` và `navigate(..., { replace: true })` sang threadId thật (nếu vẫn còn ở trang tempId). Ghi `sessionStorage` map `__threadAlias:tempId = realId` để autostart không bị chạy lại 2 lần.
     - Khi lỗi: toast + rollback (xoá cache tạm + navigate quay lại `fromHref`).
- Với `handleAttach`, lưu payload base64 vào `sessionStorage.__attach:${tempId}` ngay trước khi navigate (như hiện tại nhưng dùng tempId).

### 2. `src/routes/_app/chat.$threadId.tsx` — Hủy stream cũ thay vì chặn
- `searchSchema` thêm `optimistic: z.string().optional()`.
- Trong `useEffect` listener `chat:dock-send`:
  - Bỏ nhánh `if (streaming) { toast.error(...); return; }`.
  - Thay bằng: nếu `streaming` ⇒ `abortRef.current?.abort()` và `await` micro-task ngắn để state `streaming` về `false`, sau đó gọi `sendUserMessage(detail.content, ...)`. Có thể dùng pattern: gọi `abortRef.current?.abort()` rồi `setTimeout(() => void sendUserMessage(...), 0)`.
- `sendUserMessage`:
  - Bỏ điều kiện `if (... || streaming) return;` — thay bằng: nếu `streaming`, abort trước, rồi tiếp tục.
- `send()` (composer Enter trong thread): cũng abort-then-send khi đang stream.
- Autostart effect: nếu route mang `optimistic === "1"` và `messages.length === 1 && role === "user"` ngay từ cache đã prime, gọi `runAssistant()` ngay không cần đợi `query.data` từ server.

### 3. Tránh "nhảy" sidebar / skeleton
- ChatDock đã `collapseChatSidebar()`. Đảm bảo gọi **trước** `navigate(...)` (đã đúng) — không có thay đổi backend nào ở đây, chỉ giữ trật tự.
- `chat.$threadId.tsx`: hiện chỉ render `ChatSkeleton` khi `query.isLoading && messages.length === 0`. Với optimistic navigation, `messages` đã có 1 user message từ cache ⇒ không hiện skeleton ⇒ chuyển trang mượt.

### Không thay đổi
- `src/lib/chat-threads.functions.ts`, `src/lib/chat.functions.ts`, schema DB, server route AI: giữ nguyên.
- Logic trong dock khi đã đang ở `/chat/$threadId` (gửi qua event `chat:dock-send`) giữ nguyên dispatcher; chỉ thay đổi cách nhận ở thread page (hủy stream cũ).

## Acceptance

- Ở `/documents` → gõ "abc" + Enter trong ChatDock ⇒ trong < 100ms thấy chuyển sang `/chat/<id>` với tin nhắn user và dấu "..." của AI; không thấy spinner full-screen, không nhấp nháy sidebar.
- Trong khi AI đang stream câu cũ ở thread, gửi câu mới qua dock (hoặc Enter ở composer) ⇒ câu cũ dừng kèm marker "_Đã dừng._", câu mới hiển thị và AI trả lời ngay.
- Reload `/chat/<id>` vẫn load đúng (server đã persist xong trong background).
- Đính kèm file qua dock từ trang khác vẫn được parse trong stream như trước.
