## Bối cảnh

- `ChatDock` (footer các trang Mode AI) đã có sẵn:
  - **Paperclip**: dropdown 3 loại (Hoá đơn mua / Sao kê NH / Phiếu thu‑chi) → đọc file → gọi `parseDocument` server fn → lưu kết quả vào `sessionStorage.lastBatchImport` và `window.__lastBatchImport` → navigate sang `/import/preview` hoặc `/bank/import-statement`.
  - **Mic**: Web Speech API (`vi-VN`, interim results) → tự gửi khi kết thúc.
- `Composer` (dùng trong trang `/chat/$threadId`) hiện đang stub 2 nút này bằng `toast.info("…đang phát triển")` → đó là lý do user thấy "đang phát triển".

## Mục tiêu

Đưa cùng bộ tính năng Paperclip + Mic vào `Composer` để hoạt động trong trang chat thread. Không đụng business logic ở `parse-document.functions.ts`.

## Thay đổi

### 1. `src/components/chat/composer.tsx`
- Thêm props tuỳ chọn để bật/tắt và override hành vi:
  - `enableAttach?: boolean` (mặc định `true`)
  - `enableVoice?: boolean` (mặc định `true`)
  - `onTranscript?: (text: string) => void` — nếu truyền vào, mic ghi xong sẽ gọi callback (cho phép parent tự `submit`); nếu không thì chỉ điền vào ô input.
- Port nguyên logic từ `ChatDock`:
  - State `recording`, `uploading`; refs `fileRef`, `recogRef`.
  - `toggleVoice()` dùng `SpeechRecognition` / `webkitSpeechRecognition`, `lang = "vi-VN"`, `interimResults = true`. Lỗi/không hỗ trợ → `toast.error`.
  - `handleUploadBatch(files, kind)` validate size ≤ 12MB + chỉ PDF/ảnh, đọc base64, gọi `parseDocument`, lưu `sessionStorage`, navigate (`useNavigate` từ `@tanstack/react-router`).
- UI: Paperclip là `DropdownMenu` với 3 item, Mic chuyển sang `MicOff` + variant `destructive` khi đang ghi. Khi `uploading` đổi icon thành `Loader2 animate-spin`. Disable khi `loading || uploading`.

### 2. `src/components/chat/chat-dock.tsx`
- Xoá khối Paperclip + Mic + input file ngoài `Composer` (giờ trùng).
- `Composer` trong dock giữ `compact`, vẫn dùng các tính năng mới qua props mặc định.
- Có thể giữ nút "History" bên ngoài.

### 3. `src/routes/_app/chat.$threadId.tsx` & `chat.index.tsx`
- Không cần thay đổi — Composer tự bật attach/voice mặc định.

## Lưu ý kỹ thuật

- File input ẩn được render bên trong `Composer` để dropdown trigger nó.
- Khi ở trang `/chat/$threadId`, navigate đi mất context streaming → giữ hành vi cũ của dock (navigate sang `/import/preview`) vẫn hợp lý vì đó là flow xử lý chứng từ.
- Mic: nếu user đang ở trang thread, `onTranscript` sẽ được dùng để tự gọi `send()` ngay sau khi ghi xong (giữ parity với dock). Mặc định khi không truyền callback → chỉ điền vào input để user xem trước.
