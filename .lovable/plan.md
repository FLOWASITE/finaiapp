## Mục tiêu

Mang 2 tính năng đã có sẵn trong `AskAiSheet` sang `ChatDock`:
1. **Mic (Web Speech API, vi-VN)** — nhấn để nói, text điền vào ô nhập, kết thúc tự gửi (tạo thread mới).
2. **Attach (PDF/ảnh)** — dropdown 3 loại chứng từ (hoá đơn mua, sao kê NH, phiếu thu/chi), parse qua server fn `parseDocument`, hiển thị progress bằng toast, xong điều hướng tới trang preview phù hợp.

Hành vi chat hiện tại của ChatDock (tạo thread → `/chat/$threadId?autostart=1`) giữ nguyên.

## Thay đổi

### 1. `src/components/chat/chat-dock.tsx`
- Import thêm: `Paperclip, Mic, MicOff, Loader2` (lucide), `DropdownMenu*`, `parseDocument`, `toast`.
- State mới: `recording`, `uploading`, refs `fileRef`, `recogRef`.
- **Voice (`toggleVoice`)**: copy nguyên xi từ AskAiSheet (Web Speech, vi-VN, interim results điền vào `input`, kết thúc gọi `submit()` để tạo thread + navigate).
- **Upload (`handleUploadBatch`)**: copy logic từ AskAiSheet, nhưng thay phần "append vào messages" bằng:
  - Toast tiến độ: `toast.loading("Đang xử lý N file…")` → cập nhật `toast.success`/`toast.error` khi xong.
  - Lưu kết quả vào `window.__lastBatchImport` và `sessionStorage.lastBatchImport` (giữ tương thích với trang preview hiện có).
  - Sau khi hoàn tất: `navigate` tới `/import/preview` (hoá đơn mua, phiếu thu/chi) hoặc `/bank/import-statement` (sao kê).
- **Layout ChatDock**:
  ```
  [Paperclip ▾]  [Mic]  [Composer + Send]  [Lịch sử]
  ```
  Đặt 2 nút mới ở bên trái Composer, dùng cùng style icon-button bo tròn (h-11 w-11) như nút Lịch sử hiện có. Nút Lịch sử giữ ở bên phải.
- Khi `recording`, placeholder Composer đổi sang "Đang nghe…" (truyền qua prop `placeholder`).

### 2. Không thay đổi
- `AskAiSheet` (Cmd+J vẫn dùng được như shortcut nhanh, không gỡ).
- `Composer` (đã có sẵn prop `placeholder`).
- Server functions, DB, route preview.

## Tệp ảnh hưởng
- Sửa: `src/components/chat/chat-dock.tsx` (file duy nhất).

## Ngoài phạm vi
- Refactor `AskAiSheet` thành component dùng chung (sẽ làm sau nếu cần — hiện chỉ copy logic để không phá Sheet đang chạy).
- Tích hợp file đính kèm trực tiếp vào thread chat AI (file đi vào flow preview/import như hiện tại, không trở thành tin nhắn AI multimodal).
- Hỗ trợ trình duyệt không có Web Speech API (vẫn hiện thông báo lỗi như AskAiSheet).
