## Mục tiêu

Gộp "Trợ lý AI" và "ChatDock" thành một điểm vào duy nhất:
- **Bỏ menu "Trợ lý AI"** trong sidebar.
- **ChatDock ở footer** là điểm gửi tin chính ở mọi trang `_app/*` khi đang ở **Mode AI**.
- Khi gửi tin từ ChatDock → tạo thread → điều hướng `/chat/$threadId?autostart=1` để xem stream và lịch sử (giữ nguyên hành vi hiện tại của trang `/chat`).
- `/chat` và `/chat/$threadId` vẫn tồn tại như "trang chi tiết hội thoại" (truy cập qua ChatDock + lịch sử sidebar trong /chat), không còn link trực tiếp trên sidebar chính.

## Thay đổi

### 1. Bỏ entry "Trợ lý AI" khỏi sidebar
- `src/components/app-sidebar.tsx` (~dòng 44): xoá entry `{ to: "/chat", label: "Trợ lý AI", icon: Sparkles }`.
- Giữ `to: "/dashboard"` là entry đầu tiên. Sparkles import có thể dọn nếu không còn dùng chỗ khác trong file.

### 2. ChatDock: gợi ý truy cập lịch sử
Vì không còn link "Trợ lý AI" trên sidebar, người dùng cần đường vào danh sách hội thoại cũ. Thêm vào `src/components/chat/chat-dock.tsx`:
- Một nút nhỏ "Lịch sử" (icon `History`) bên cạnh ChatDock, link tới `/chat` (trang index hiển thị danh sách thread + gợi ý).
- Giữ nguyên hành vi gửi tin: `createThread` → `appendMessage` → `navigate /chat/$threadId?autostart=1`.

### 3. Phạm vi hiển thị (giữ nguyên)
- `src/routes/_app.tsx`: ChatDock hiển thị khi `workspace === "front"` (Mode AI) VÀ route không bắt đầu bằng `/chat` — không thay đổi.

### 4. Không thay đổi
- Trang `/chat`, `/chat/$threadId`, sidebar thread list trong trang chat.
- Server functions, DB schema, streaming logic, AskAiSheet (vẫn tồn tại như shortcut hỏi nhanh).
- Mode switching (Kế toán ↔ AI).

## Tệp ảnh hưởng
- Sửa: `src/components/app-sidebar.tsx` (xoá entry), `src/components/chat/chat-dock.tsx` (thêm nút Lịch sử).

## Ngoài phạm vi
- Đổi ChatDock thành popover/expand inline (đã chọn phương án mở `/chat`).
- Gỡ bỏ `/chat` route hay `AskAiSheet`.
- Thêm gợi ý prompt nhanh trong ChatDock (có thể bàn ở lượt sau nếu muốn).
