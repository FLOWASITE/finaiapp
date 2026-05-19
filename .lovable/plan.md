# Giảm độ trễ ChatDock trên Inbox & các trang khác

## Vấn đề
Trên các trang ngoài `/chat/$threadId` (Inbox, Dashboard, …), khi bấm Gửi trong ChatDock luồng hiện tại là:
1. `await createThread` (roundtrip 1)
2. `await appendMessage` (roundtrip 2)
3. `setInput("")` + `navigate` sang `/chat/$threadId?autostart=1`

→ Composer "treo" 1–2 giây, ô nhập không clear, nút Gửi không phản hồi → cảm giác "không phản hồi liền".

## Mục tiêu
- Bấm Enter/Gửi → ô nhập clear ngay, composer disable + hiện trạng thái "Đang mở phiên…" ngay lập tức.
- Tạo thread ở nền và navigate sang phiên mới ngay khi sẵn sàng; trên trang `/chat/$threadId` đã có sẵn skeleton + autostart.

## Thay đổi (chỉ UI/serverFn nội bộ, không đụng business logic)

### 1. `src/lib/chat-threads.functions.ts`
Thêm `createThreadWithFirstMessage` để gộp create + append vào **1 roundtrip**:
- Input: `{ title?, role: "user", content, metadata? }`
- Handler: insert `chat_threads` → insert `chat_messages` (cùng user_id/tenant_id) → update `last_message_at` + `title` nếu trống.
- Output: `{ thread: ChatThread, message: ChatMessage }`.
- Dùng cùng pattern `withTenant` + validator như các fn hiện có.

### 2. `src/components/chat/chat-dock.tsx`
Refactor `submit()` và `handleAttach()` cho nhánh "chưa có thread":

```text
submit(q):
  if no existing thread:
    setInput("")           // clear NGAY
    setLoading(true)       // composer disabled NGAY (đã có)
    // optional: toast.loading("Đang mở phiên trò chuyện…")
    createThreadWithFirstMessage({ ... })  // 1 roundtrip thay vì 2
      .then(t => navigate("/chat/$threadId", { autostart: "1", from }))
      .catch(err => { setInput(q); toast.error(...) })  // rollback nếu fail
      .finally(() => setLoading(false))
    return  // không await ở caller → UI tự do
```

Tương tự cho `handleAttach`: clear input + setLoading ngay, dispatch background, navigate khi xong; nếu lỗi rollback `setInput(q)` để user không mất nháp.

Giữ nguyên nhánh "đã có thread" (đã instant qua event `chat:dock-send`).

### 3. Không thay đổi
- `chat.$threadId.tsx` autostart loader đã đọc `messages.length === 1 && role === "user"` → vẫn chạy đúng vì serverFn mới đã chèn message đầu tiên.
- `thread-list.tsx`, `inbox.tsx`, system-prompt: không đụng.

## Kiểm thử nhanh sau khi build
1. Vào `/inbox`, gõ "test" → bấm Enter: input phải clear < 100ms, nút Gửi disable + spinner; sau đó nhảy sang `/chat/<id>?autostart=1` và assistant bắt đầu stream.
2. Kéo file PDF vào ChatDock ở `/inbox`: composer clear ngay, chuyển sang thread mới, parse + stream như cũ.
3. Trên `/chat/<id>` đang mở: gửi tin vẫn instant như trước (không đổi nhánh code này).
4. Tắt mạng → bấm Gửi ở `/inbox`: hiện toast lỗi, input được khôi phục.

## Lý do hợp lý
- Cắt 1 roundtrip mạng (≈ 200–500 ms) bằng serverFn gộp.
- Bỏ `await` trên đường UI chính → cảm giác phản hồi tức thì kể cả khi mạng chậm.
- Rollback nháp khi lỗi để không mất nội dung user đã gõ.
