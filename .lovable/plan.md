## Mục tiêu
1. **Upload chạy nền**: khi user bấm "Tải lên", dialog có thể đóng/thu nhỏ ngay, quá trình upload tiếp tục chạy ngầm — user vẫn dùng được các phần khác của app.
2. **Cải thiện UI tiến độ**: thanh tiến độ rõ ràng hơn (tổng quan + per-file), có ETA, đếm done/failed/rejected, có thể chạy song song nhiều file (concurrency) thay vì tuần tự chậm như hiện tại.

## Kiến trúc

### A. Upload store toàn app (Zustand-style đơn giản qua React Context + reducer)
Tạo `src/lib/upload-queue.tsx` cung cấp:
- `UploadQueueProvider` đặt trong `src/routes/_app.tsx` (bọc toàn bộ app sau khi đăng nhập) — nhờ vậy state sống ngoài `UploadDialog`, không bị unmount khi đóng dialog.
- Hook `useUploadQueue()` trả về:
  - `jobs`: danh sách job (mỗi job = 1 batch upload từ 1 lần bấm submit). Mỗi job có `id, createdAt, docKind, notes, items[], status, startedAt, finishedAt`.
  - `enqueue(opts)`: tạo job mới + bắt đầu chạy ngay; trả `jobId`.
  - `cancel(jobId)` / `dismiss(jobId)` / `retryItem(jobId,itemId)`.
- Mỗi `item` giữ: `file (giữ tham chiếu File để đọc lại khi retry), name, size, mime, status (pending|uploading|done|failed|rejected), message, ocrStatus, detectedKind, tenantMatch, tenantMatchReason, startedAt, finishedAt`.
- **Concurrency**: chạy song song tối đa 4 file/job (constant `MAX_CONCURRENCY = 4`) bằng worker pool đơn giản. Tăng tốc đáng kể so với for-loop tuần tự hiện tại.
- Sau mỗi item done/failed/rejected → `queryClient.invalidateQueries` các key liên quan (documents, sales-documents, purchase-documents, sidebar-counts) bằng debounce 800ms để không spam.
- Khi job done → toast tổng kết (giống logic hiện tại trong `submit()`).
- Không persist sang localStorage (file object không serialize được); nếu user reload thì các job đang chạy mất — chấp nhận, hiển thị cảnh báo `beforeunload` nếu còn job đang chạy.

### B. Dock nổi "Đang tải lên" (UploadDock)
File mới `src/components/upload-dock.tsx`, render trong `_app.tsx` (cùng cấp với chat dock).
- Vị trí: cố định góc dưới-phải (above chat dock), `z-50`, có animation slide-up bằng framer-motion.
- 2 trạng thái:
  - **Thu gọn (mặc định khi minimize)**: pill nhỏ `[icon spin] Đang tải 12/30 file · 40%` + nút mở rộng + nút đóng (chỉ ẩn dock, không hủy job).
  - **Mở rộng**: card ~360px rộng, tối đa ~420px cao, có:
    - Header: tổng quan tất cả job đang chạy/finished gần đây (gộp số liệu).
    - Body: list từng job (collapsible từng job nếu >1) → trong mỗi job: thanh progress tổng + list per-file rút gọn (icon + tên truncate + badge trạng thái + spinner).
    - Footer mỗi job done: nút "Đóng" để xóa khỏi dock; nút "Xem chi tiết" → mở lại dialog ở chế độ kết quả (read-only).
- Dock chỉ hiện khi có ít nhất 1 job đang chạy hoặc job vừa xong chưa được dismiss. Tự ẩn 5s sau khi tất cả job done & không có lỗi.

### C. UploadDialog (`src/routes/_app/documents/index.tsx`) chỉnh lại
- Bỏ logic upload nội bộ trong `submit()` — chuyển sang gọi `enqueue({ items, docKind, notes })` từ store.
- Sau khi `enqueue` thành công:
  - Đóng dialog ngay (`onOpenChange(false)`); reset state.
  - Toast nhỏ: `"Đang tải {n} file ở chế độ nền — xem góc dưới-phải"` (dùng `finToast.info`).
- Thêm nút phụ "Thu nhỏ" cạnh nút "Tải lên" — tác dụng giống "Tải lên" rồi đóng (đây là default behavior mới luôn).
- Trong khi user còn đang chọn file (dialog chưa submit) thì giữ nguyên hành vi hiện tại (filter folder XML, drag-drop, v.v.).
- Khi tab `documents` đang mở mà có item vừa done → đã có invalidateQueries từ store, list tự refresh.

### D. UI tiến độ tốt hơn (áp dụng trong dock + dialog kết quả)
- Thanh progress 2 lớp: `Progress` chính (% done) + lớp mờ phía dưới (% đang chạy gồm `uploading`).
- Hiển thị: `12 ✓ · 1 ✗ · 2 ⏳ / 30` + `40%` + ETA tính bằng trung bình thời gian/file đã xong × số còn lại (chỉ hiện khi ≥3 file đã xong, tránh số ảo).
- Per-file dòng: icon + tên + badge:
  - `pending` → dot xám
  - `uploading` → spinner xanh
  - `done` → check xanh + (nếu có) badge OCR
  - `failed` → ❌ + tooltip message + nút "Thử lại"
  - `rejected` → 🚫 + reason ngắn
- Dùng `framer-motion` để fade item khi đổi trạng thái.

## File thay đổi
- **Mới**: `src/lib/upload-queue.tsx`, `src/components/upload-dock.tsx`, `src/components/upload-progress-bar.tsx` (thanh progress 2 lớp + ETA, dùng chung).
- **Sửa**: `src/routes/_app.tsx` (gắn Provider + Dock), `src/routes/_app/documents/index.tsx` (UploadDialog dùng `enqueue` thay cho upload trực tiếp; thêm hiển thị file list trong dialog vẫn ok khi đang chạy — nhưng đóng dialog vẫn tiếp tục).

## Giới hạn / lưu ý
- Concurrency 4 là an toàn cho server function hiện tại; nếu thấy throttle có thể giảm về 2 — để hằng số dễ chỉnh.
- File `File` giữ trong RAM trong suốt vòng đời job; sau khi `dismiss` job sẽ giải phóng.
- Nếu user navigate sang route khác trong khi upload chạy: Dock vẫn hiển thị, jobs vẫn chạy (vì sống trong `_app` Provider). Khi quay về `documents`, list refresh tự động.
- Reload trang sẽ hủy job đang chạy; thêm `beforeunload` warning để cảnh báo.
