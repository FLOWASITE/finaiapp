## Mục tiêu

Làm lại layout `/chat` theo phong cách Gemini (gọn, nhiều khoảng trắng, composer nổi ở đáy, message canh full-width thay vì avatar 2 bên), giữ theme auto (sáng/tối theo app), áp cho cả mobile & desktop. Thêm toggle **Mode AI ↔ Mode Kế toán** ngay trên header.

## Hai mode hoạt động

- **Mode Kế toán** (mặc định): Fin trả lời sổ sách, đọc dữ liệu, gợi ý hành động — như hiện tại, có gọi tool kế toán (PendingActions, hạch toán, đối soát…).
- **Mode AI**: Hội thoại tự do với LLM, không gọi tool nội bộ, không pending actions, system prompt rút gọn — dùng khi user chỉ muốn hỏi đáp/nháp văn bản.

Trạng thái mode lưu localStorage (`fin:chat-mode`), truyền vào `askAccountingStream` qua field `mode: "accounting" | "ai"` để server-side bỏ qua tool registry khi `mode==="ai"`.

## Thay đổi UI

### Header mới (`ChatHeader` component dùng chung mobile+desktop)
```
[☰]   Fin · {threadTitle hoặc "Cuộc trò chuyện mới"}        [Mode toggle] [⋯]
```
- `☰`: toggle ThreadList sidebar (mobile = Sheet, desktop = collapse như hiện tại).
- Mode toggle: pill 2 segment "Kế toán | AI" (shadcn ToggleGroup), width ~140px, có icon `Calculator` / `Sparkles`.
- `⋯`: menu New chat / Đổi tên / Xoá.

### Message list
- Bỏ avatar Fin lớn ở mỗi message; user = bubble bo tròn lệch phải (nền `muted`), assistant = full-width không bubble — giống Gemini.
- Action bar (👍 👎 ↻ ⧉ ⋯ 🔊) hiện dưới mỗi assistant message; tận dụng `message-actions.tsx` đã có, chỉ chỉnh layout.
- Footer subtle: "Fin có thể mắc sai sót. Vui lòng kiểm tra số liệu quan trọng." (text-muted-foreground text-xs, center).

### Composer
- Bo tròn pill lớn, icon `+` (attach) bên trái, mic + send bên phải, placeholder đổi theo mode: "Hỏi Fin về sổ sách…" / "Hỏi AI bất cứ điều gì…".
- Giữ `Composer` hiện tại, chỉ restyle (rounded-full, padding lớn hơn, bỏ border ngoài).

### Empty state (`/chat` index)
- Giữ FinMascot + suggestion grid, nhưng khi `mode==="ai"` đổi 4 suggestion sang câu hỏi tự do ("Tóm tắt văn bản…", "Soạn email báo giá…", "Giải thích nghị định 123…", "Dịch đoạn này…") và đổi câu chào.

## Thay đổi code

| File | Thay đổi |
|---|---|
| `src/hooks/use-chat-mode.ts` (mới) | Hook đọc/ghi `fin:chat-mode`, emit event để các page sync. |
| `src/components/chat/chat-header.tsx` (mới) | Header dùng chung: hamburger + title + mode toggle + more menu. |
| `src/routes/_app/chat.tsx` | Bọc `<ChatHeader>` lên trên `<Outlet>`; ThreadList chuyển sang `Sheet` ở mobile. |
| `src/routes/_app/chat.$threadId.tsx` | Xoá header cũ trong file (PanelLeft button), truyền `mode` vào `askFn`. |
| `src/routes/_app/chat.index.tsx` | Suggestion đổi theo mode; bỏ FinMascot ở desktop hoặc thu nhỏ; composer pill style. |
| `src/components/chat/message-list.tsx` | Bỏ avatar mỗi turn, đổi user → bubble phải, assistant → full-width. |
| `src/components/chat/composer.tsx` | Restyle rounded-full, đổi placeholder theo prop `mode`. |
| `src/lib/chat.functions.ts` | Thêm input `mode?: "accounting" \| "ai"`; khi `"ai"` không attach tool registry. |
| `src/styles.css` | Thêm token `--chat-bubble-user`, `--chat-surface` (đã có chat-surface). |

## Không đổi
- Lưu trữ thread, streaming pipeline, attachments, PendingActions logic — chỉ ẩn UI khi mode AI.
- Tab "Trí nhớ AI > Agent của Fin" giữ nguyên (đây không phải AI Mode).

## Câu kết
Sau khi triển khai, user có 1 nút bấm trên header để bật/tắt Mode AI; toàn bộ chat trông tối giản theo Gemini nhưng vẫn auto-theme và hoạt động trên cả mobile lẫn desktop.
