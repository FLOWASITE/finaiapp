# Hoàn thiện UI Tải tài liệu — Trung tâm tài liệu

Tinh chỉnh `UploadDialog` trong `src/routes/_app/documents/index.tsx` (và mở rộng nhẹ `uploadDocument` server fn) để hỗ trợ multi-file mượt mà, cho phép "Tự xác định" loại tài liệu, và làm UI đẹp hơn.

## 1. Cho phép tải nhiều file (đã có `multiple`, nâng cấp UX)

- Drag & drop zone lớn: kéo-thả nhiều file vào, hoặc click chọn. Hover/drag state có viền dashed + nền `bg-muted/40`.
- Khi đã chọn file: nút "Thêm file" để bổ sung (gộp vào danh sách hiện có, không replace).
- Danh sách file dạng card:
  - Icon theo MIME (PDF / ảnh / Excel / XML / Word).
  - Tên file + dung lượng (badge nhỏ).
  - Nút X để xoá từng file trước khi upload.
  - Giới hạn 20MB/file — file vượt sẽ hiện badge đỏ "Vượt 20MB" và bị disable.
- Trong khi upload:
  - Progress chung "Đang tải 3/10…" + thanh `Progress`.
  - Mỗi file có trạng thái riêng: ⏳ chờ → 🔄 đang xử lý → ✅ xong / ❌ lỗi (kèm OCR status nếu có).
- Sau khi xong: giữ dialog mở 1s để user thấy kết quả, hoặc auto-close + toast tổng kết (giống hiện tại).

## 2. Cho phép bỏ chọn loại tài liệu → "Tự xác định"

- Thêm option `{ value: "auto", label: "Tự xác định (Fin sẽ tự nhận diện)" }` vào `UPLOAD_KINDS`, đặt đầu danh sách và đặt làm **default**.
- Hiển thị mô tả nhỏ dưới select khi chọn auto: *"Fin sẽ đọc nội dung và tự gán loại: Hóa đơn mua/bán, Sao kê, Phiếu thu/chi…"*
- Server `uploadDocument` (`src/lib/documents.functions.ts`):
  - Mở rộng zod enum `doc_kind` thêm `"auto"`.
  - Khi `doc_kind === "auto"`: insert vào DB với `doc_kind = "other"` (placeholder), rồi gọi `parseFileCore({ kind: "auto" })`. Hàm này đã có sẵn classifier và đã `update({ doc_kind: actualKind })` ở dòng 1141 → loại thật sẽ được ghi đè sau OCR.
  - Trả về `doc_kind` thật trong response để UI hiển thị.

## 3. UI thẩm mỹ hơn

- Dialog rộng hơn (`max-w-2xl`), padding thoáng, layout 2 cột nhỏ ở header (icon + tiêu đề + mô tả ngắn).
- Drop zone với icon `CloudUpload` lớn, text 2 dòng: "Kéo-thả file vào đây" + "hoặc bấm để chọn · PDF, ảnh, Excel, XML, Word · tối đa 20MB/file".
- Section "Loại tài liệu" và "Ghi chú" thu gọn vào 1 hàng grid `md:grid-cols-2` để cân đối.
- Footer:
  - Bên trái: tổng dung lượng `Tổng: 12.4 MB · 5 file`.
  - Bên phải: nút Huỷ + nút primary "Tải lên N file" (số động theo `files.length`).
- Empty state khi chưa có file: drop zone chiếm trọn, ẩn danh sách.
- Toast tổng kết giữ nguyên định dạng nhưng thêm icon ✅.

## Technical Details

**Files thay đổi:**
- `src/routes/_app/documents/index.tsx`
  - `UPLOAD_KINDS`: thêm `auto` ở đầu.
  - `UploadDialog`: rewrite phần JSX body + state cho per-file progress (`Map<string, "pending"|"uploading"|"done"|"failed">`), drag handlers, remove-file handler, append-file handler.
- `src/lib/documents.functions.ts`
  - `uploadDocument.inputValidator`: thêm `"auto"` vào enum.
  - Trong `.handler()`: nếu `data.doc_kind === "auto"` → set `insertKind = "other"`, `parserKind = "auto"`; ngược lại giữ logic cũ. Trả thêm `doc_kind` trong response.

**Không thay đổi:**
- `parseFileCore`, schema DB, logic OCR/cache, các phần khác của trang Documents.
- Không động vào filter `UPLOAD_KINDS` ở chỗ khác (chỉ thêm option mới, các filter hiện tại không dùng `auto`).

**Phạm vi UI-only + 1 chỉnh nhỏ ở server** để hỗ trợ "auto". Không đụng business logic hạch toán.
