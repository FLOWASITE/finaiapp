## Gộp AskAiSheet vào ChatDock

Đã chốt: giữ **ChatDock** (thanh nhập ở footer), bỏ hẳn **AskAiSheet** (Sheet popup + nút Sparkles nổi). Mọi lượt chat đều tạo thread + điều hướng sang `/chat/$threadId` (đã lưu DB như hiện tại).

### Việc cần làm

**1. ChatDock (`src/components/chat/chat-dock.tsx`)** — bổ sung 3 thứ nhỏ để thay thế vai trò AskAiSheet:
- Lắng nghe phím tắt **Cmd/Ctrl + J** → focus vào ô nhập (thay vì mở Sheet).
- Lắng nghe event `app:open-ai` (giữ tên cũ để không phải sửa nhiều caller) → prefill ô nhập + focus, không auto-submit.
- Render nút **Sparkles nổi** ở góc dưới-phải (giống nút cũ của AskAiSheet) — bấm vào cũng focus ô nhập. Giữ lại để user quen tay vẫn thấy.
- Truyền `ref` vào `Composer` để focus được. Cập nhật `Composer` thêm prop `inputRef?: Ref<HTMLTextAreaElement>` (forward sang `<textarea>`).

**2. Shim cho `openAskAi`** — nhiều file đang import:
- `src/routes/_app/inbox.tsx`, `inbox_.$lane.tsx`
- `src/components/ai/InsightWidget.tsx`
- `src/components/command-palette.tsx`

Tạo file mới **`src/lib/open-ask-ai.ts`** chứa hàm `openAskAi(prefill?: string)` đúng signature cũ — vẫn dispatch `CustomEvent("app:open-ai", { detail: { prefill } })`. ChatDock sẽ bắt event này.

Sửa các import từ `@/components/ai/AskAiSheet` → `@/lib/open-ask-ai` ở 4 file trên. Không đổi logic gọi.

**3. Xoá AskAiSheet**
- Xoá `src/components/ai/AskAiSheet.tsx`.
- Trong `src/routes/_app.tsx`: bỏ import + bỏ `<AskAiSheet />` khỏi JSX.

**4. Giữ nguyên**
- `PendingActions`, `ChartBlock` — vẫn còn được dùng ở route `/chat/$threadId` (kiểm tra nhanh khi sửa, không xoá).
- Comment trong `bank.import-statement.tsx` ("Load parsed batch from AskAiSheet") — cập nhật text comment cho khớp: "from ChatDock".
- Toàn bộ luồng upload/mic/thread của ChatDock hiện tại.

### Ngoài phạm vi
- Không đổi UX `/chat/$threadId` (trang chat full-page).
- Không thêm tính năng inline chat (popup) — đã thống nhất bỏ.
- Không refactor `Composer` quá tay, chỉ thêm prop `inputRef`.

### Files sẽ chạm
- sửa: `src/components/chat/chat-dock.tsx`
- sửa: `src/components/chat/composer.tsx` (thêm `inputRef`)
- sửa: `src/routes/_app.tsx` (bỏ `AskAiSheet`)
- sửa: `src/routes/_app/inbox.tsx`, `src/routes/_app/inbox_.$lane.tsx`, `src/components/ai/InsightWidget.tsx`, `src/components/command-palette.tsx` (đổi import)
- sửa (comment): `src/routes/_app/bank.import-statement.tsx`
- tạo: `src/lib/open-ask-ai.ts`
- xoá: `src/components/ai/AskAiSheet.tsx`
