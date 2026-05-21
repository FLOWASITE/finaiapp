## Mục tiêu

Hiện tại: ngay khi chọn file (Paperclip), `Composer` gọi `onAttach` → ChatDock **gửi luôn** một message tự sinh "Xử lý N chứng từ…". Người dùng không kịp viết kèm chỉ dẫn cho từng file.

Mong muốn (theo ảnh tham khảo): file vừa chọn xuất hiện dưới dạng **chip preview** ngay phía trên ô nhập (thumbnail ảnh + tên + nút X). Người dùng có thể:
- Thêm/bớt nhiều file
- Gõ tin nhắn mô tả (vd "đây là HĐ mua VPP, hạch toán 6422")
- Bấm gửi → message + tất cả file được gửi chung trong **một lượt**

## Phạm vi thay đổi (chỉ UI/FE)

### 1. `src/components/chat/composer.tsx`
- Thêm state nội bộ `pendingAttachments: AttachmentPayload[]`.
- Khi user chọn file ở Paperclip:
  - Đọc base64 như hiện tại, nhưng **không gọi `onAttach` ngay**.
  - Đẩy vào `pendingAttachments` và **render strip chip** phía trên textarea trong cùng khung bo tròn:
    - PDF/file: icon tài liệu + tên + đuôi/kích thước
    - Ảnh: thumbnail vuông bo góc (object-cover) từ `data:` URL
    - Nút `X` ở góc để xoá từng file
- Khi user bấm Gửi (hoặc Enter):
  - Nếu có `pendingAttachments`: gọi `onAttach(pendingAttachments, value)` rồi clear chip + clear input.
  - Nếu không có file: gọi `onSubmit()` như cũ.
- Cho phép submit khi **có file kể cả input rỗng** (nới `disabled`).
- Hỗ trợ paste/drag-drop file vào khung composer (bonus nhẹ, dùng cùng pipeline `readBase64`).
- Mở rộng kiểu: `onAttach?: (files: AttachmentPayload[], note?: string) => void`.

### 2. `src/components/chat/chat-dock.tsx` (`handleAttach`)
- Nhận thêm tham số `note?: string`.
- Khi tạo `content` cho message: nếu có `note` → dùng `note`; nếu không → fallback "Xử lý N chứng từ…\n📎 …" như hiện tại.
- Phần `metadata.attachments` + `sessionStorage __attach:` giữ nguyên để pipeline `runAssistant` đã sẵn có vẫn forward base64 lên `askAccountingStream`.

### 3. `src/routes/_app/chat.$threadId.tsx` (handler `handleAttach` ở route thread)
- Cập nhật chữ ký giống ChatDock: nhận `note?: string` và truyền vào `sendUserMessage(note ?? fallback, attachments)`.

### Không đổi
- `src/lib/chat.functions.ts` đã hỗ trợ `attachments[]` + `question` text → backend đã sẵn sàng.
- Không sửa schema DB, không sửa server function, không sửa parser.

## Wireframe ASCII

```text
┌──────────────────────────────────────────────────────────┐
│  [thumb] tên-file.pdf  ✕   [thumb] hoa-don.jpg  ✕        │  ← chip strip
│ ──────────────────────────────────────────────────────── │
│  Nhắn cho trợ lý AI…                                     │  ← textarea
│                                  📎  🎤  ⬆ (gửi)         │
└──────────────────────────────────────────────────────────┘
```

## Edge cases
- Đang `uploading` (đọc base64) → disable Gửi, hiện spinner trên Paperclip.
- Bỏ hết chip → quay về trạng thái text-only bình thường.
- Giới hạn hiện tại (12MB, PDF/ảnh) giữ nguyên trong `validateFiles`.
- Khi gửi xong, clear cả `pendingAttachments` và `input` đồng thời.

## Ngoài phạm vi (sẽ không làm trong lượt này)
- Ghi chú riêng cho **từng file** (per-file note).
- Đổi `kind` (purchase_invoice / bank_statement / cash_voucher) ngay trên chip — vẫn giữ dropdown ở Paperclip như hiện tại.
- Sửa luồng legacy parse 2-phase (`__lastBatchImport`), vì luồng đó chỉ chạy khi không có `onAttach`.
