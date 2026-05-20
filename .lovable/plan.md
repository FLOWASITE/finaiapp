## Hiện trạng

Trang `/documents` đã có filter (nguồn, loại, OCR, ngày), drawer xem trước (image/PDF), tab OCR/Liên kết, xoá, gỡ liên kết. Bảng `documents` đã có cột `ai_upload_id`, `einvoice_id`, đã bridge từ chatbot (`ai_chat`) và backfill. Server fn `uploadDocument` đã viết nhưng **chưa có UI**.

DB hiện đang chứa 5 dòng: 3 từ chatbot (`ai_chat`), 2 manual.

## Còn thiếu — sẽ làm

### 1. UI upload tay (`/documents`)
- Thêm nút **"Tải lên"** ở header trang.
- Dialog chọn nhiều file (drag-drop) + dropdown `doc_kind` + ghi chú; gọi `uploadDocument` lần lượt, toast tiến độ; invalidate list.
- Giới hạn 20MB/file, mime hợp lệ (pdf, image, xml, xlsx).

### 2. Icon nguồn + UX bảng
- Thay text `source` bằng icon + tooltip: `Upload` (manual), `Bot` (ai_chat), `RefreshCw` (tct_sync / einvoice_sync), `Mail` (email), `Landmark` (bank_import), `Plug` (api).
- Icon loại tài liệu (FileText / Receipt / Landmark / FileSpreadsheet…) thay cho icon FileText chung.
- Hiển thị badge OCR có màu (done = emerald, processing = amber, failed = destructive).
- Hiển thị size_bytes, hover-row highlight, click-row mở drawer.

### 3. Highlight + deep-link
- Đọc `?highlight=<id>` từ search params → tự mở drawer + scroll-into-view + ring-2 hàng đó trong 2s.
- Hỗ trợ điều hướng từ chatbot và các trang khác.

### 4. Drawer — tab OCR mở rộng
- Nếu có `ai_upload_id`: query `ai_uploads` (parser_used, pages, parser_ms, status, error) và hiển thị block metadata.
- Nút **"Parse lại"** (chỉ khi `ocr_status` ∈ `failed`/`done` và có file): server fn `reparseDocument` → tải file từ Storage, gọi lại `parseDocument` (đã có), update `documents.ocr_extracted` + `ocr_status`.
- Tab **Liên kết**: nếu `einvoice_id` không null → thêm nút mở `/einvoices/$id`.

### 5. Chatbot → Tài liệu
- Trong `parse-progress-dialog.tsx`, ở phase `ready` cho mỗi file: bên cạnh "Xem file gốc" thêm nút **"Mở trong Tài liệu"** → `/documents?highlight={document_id}` (lấy `document_id` từ `ai_uploads.document_id` qua field trả về của `parseDocument`).
- Yêu cầu `parseDocument` trả thêm `documentId` (đã có sẵn nhờ bridge ở `ensureUploadRow`).

### 6. Bridge TCT sync → `documents`
- Trong `src/lib/einvoices-sync.functions.ts` (chỗ insert/upsert `einvoices` sau khi sync): nếu có XML/PDF được tải về bucket `einvoices`, upsert row `documents` với `source='tct_sync'`, `doc_kind='einvoice'`, `einvoice_id` set, `checksum_sha256` (sha của XML), idempotent qua `ON CONFLICT (tenant_id, checksum_sha256)`.
- Nếu sync hiện tại chưa lưu file gốc → chỉ tạo document "metadata-only" (storage_path để rỗng? — KHÔNG, do schema NOT NULL). Trong trường hợp này tạm bỏ qua; chỉ bridge khi đã có file. Sẽ log để biết.

### 7. Phân trang nhẹ
- Hiển thị `total` ở footer + nút "Tải thêm" tăng offset (giữ đơn giản, không full pagination).

## File đụng tới

- `src/lib/documents.functions.ts` — thêm `reparseDocument`, mở rộng `getDocument` để kèm `aiUpload` metadata (join `ai_uploads`).
- `src/routes/_app/documents/index.tsx` — nút upload + dialog, icon nguồn/loại, highlight param, drawer OCR mở rộng, nút "Mở einvoice".
- `src/components/chat/parse-progress-dialog.tsx` — nút "Mở trong Tài liệu".
- `src/lib/ai/parse-document.functions.ts` — đảm bảo trả về `documentId` cho UI.
- `src/lib/einvoices-sync.functions.ts` — bridge insert documents khi đã có file.

## Không đụng

- Migration mới (schema đã đủ).
- RLS, bucket, trigger.
- Logic classify-import, dedupe.

## Hỏi nhanh trước khi làm

Bạn muốn nút **"Parse lại"** chạy ngay trên trang Tài liệu (đồng bộ, hiện spinner) hay đẩy vào hàng đợi background? Mình đề xuất chạy đồng bộ (đơn giản, file nhỏ <10MB) — OK chứ?
