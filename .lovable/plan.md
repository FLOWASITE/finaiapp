# Hoàn thiện Chatbot hỏi đáp

Mục tiêu: nâng UX trang `/chat/$threadId` ngang chuẩn ChatGPT — markdown đẹp, thấy được AI đang làm gì, duyệt hành động ngay trong hội thoại, và kiểm soát stream.

## 1) Render markdown trong tin nhắn AI

- Cài `react-markdown` + `remark-gfm` (đã có `parseChartBlocks` cho biểu đồ → giữ nguyên).
- Tạo `src/components/chat/markdown.tsx` bọc `ReactMarkdown` với `remarkGfm`, style bằng tokens hiện có (prose-tone tự viết, không dùng plugin typography để tránh đụng theme):
  - `p`, `ul/ol/li`, `strong/em`, `code` inline + `pre code` block (nền `bg-muted/50`, `rounded-md`, scroll-x), `table` với border + `th/td` padding, `a` màu primary underline, `blockquote` border-l.
- `MessageList`: thay `<div className="whitespace-pre-wrap">{part.value}</div>` (assistant text) bằng `<Markdown>{part.value}</Markdown>`. User bubble giữ `whitespace-pre-wrap`.

## 2) Hiện tool calls (runQuery / proposeAction)

Hiện stream chỉ trả `delta` text → tool calls vô hình. Mở rộng kênh stream:

- `src/lib/chat.functions.ts`: thay vì chỉ `for await (delta of result.textStream)`, dùng `result.fullStream` và yield 3 loại event:
  - `{ type: "text", delta }`
  - `{ type: "tool-call", toolCallId, toolName, input }`
  - `{ type: "tool-result", toolCallId, output }` (cắt ngắn output > 4KB để không phình message)
- Lưu DB: cùng buffer text như cũ; thêm `tool_events: Array<{...}>` ghi kèm vào `chat_messages.metadata` (cột jsonb — nếu chưa có thì thêm migration `alter table chat_messages add column metadata jsonb`).
- `ChatMsg` (client): thêm optional `toolEvents`. Khi stream, append vào state theo từng event.
- `MessageList`: phía trên text của assistant, render `<ToolCallsAccordion events={...} defaultOpen={false} />`:
  - Hàng tóm tắt: icon (Database cho runQuery, Wand cho proposeAction) + tên tool + badge trạng thái (Đang chạy / Xong / Lỗi).
  - Click mở details: SQL/params (code block) + JSON result (cắt nếu dài + nút "Sao chép").
  - Nhiều tool calls → list nhỏ gọn, mỗi cái 1 accordion.
- Khi load lại thread từ DB: đọc `metadata.toolEvents` để dựng lại accordion.

## 3) Wire PendingActions vào chat

`PendingActions.tsx` đã sẵn (list / approve / cancel), chưa được render.

- Trang `/chat/$threadId`: thêm `<PendingActions />` ngay trên `Composer`, chỉ hiện khi có hành động (component tự ẩn nếu list rỗng).
- Sau khi `proposeAction` tool chạy xong (stream nhận tool-result), invalidate `["ai_actions_pending"]` để card xuất hiện ngay (không phải đợi 5s polling).
- Trang index `/chat` cũng cho hiện nếu có pending (giúp user thấy việc còn dang dở).

## 4) Stop streaming + Copy + Regenerate

**Stop:**
- `askAccountingStream` thêm `abortSignal: request.signal` vào `streamText` (server fn của TanStack hỗ trợ — kiểm tra `context.request.signal`; nếu generator bị huỷ phía client, signal sẽ abort).
- Client: dùng `AbortController`; nút Send chuyển thành nút Stop (icon `Square`) khi `streaming === true`. Click Stop → `controller.abort()` → break vòng `for await`. Phần text đã stream được lưu DB như bình thường (kèm marker `\n\n_Đã dừng._`).

**Copy:**
- Mỗi assistant message hover hiện hàng action nhỏ phía dưới: nút Copy (icon `Copy`), copy `m.content` (raw markdown) → `navigator.clipboard.writeText` + toast.

**Regenerate:**
- Nút "Tạo lại" chỉ hiện ở tin assistant cuối cùng (không streaming): xoá tin AI cuối khỏi DB (server fn mới `deleteLastAssistantMessage(threadId)`) + state, rồi gọi lại `runAssistant(history_without_last_assistant)`.

## Phạm vi files

- ➕ `src/components/chat/markdown.tsx`
- ➕ `src/components/chat/tool-calls.tsx`
- ➕ `src/components/chat/message-actions.tsx` (Copy / Regenerate)
- 📝 `src/components/chat/message-list.tsx` — markdown + actions + tool accordion
- 📝 `src/components/chat/composer.tsx` — hỗ trợ prop `onStop` + đổi icon
- 📝 `src/routes/_app/chat.$threadId.tsx` — AbortController, regenerate, mount PendingActions, parse stream events
- 📝 `src/lib/chat.functions.ts` — `fullStream` + abortSignal + emit tool events
- 📝 `src/lib/chat-threads.functions.ts` — `appendMessage` nhận `metadata`; mới: `deleteLastAssistantMessage`, `getThread` trả metadata
- 🗄️ Migration: `alter table chat_messages add column if not exists metadata jsonb`
- 📝 Deps: `bun add react-markdown remark-gfm`

Không đụng `chat-dock.tsx`, không đổi flow tạo thread, không sửa cài đặt model.
