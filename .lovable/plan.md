## Hiện trạng

Đã có `/_app/documents/index.tsx` (trang "Tài liệu") chạy trên bảng `documents` với lọc theo loại / OCR / ngày, drawer preview + tabs (Preview / OCR / Liên kết). Nhưng:

- Bảng `documents` chỉ có **3 dòng** do hầu như chưa có flow tự động ghi vào.
- Chứng từ upload qua **chatbot** đang ghi vào bảng riêng `ai_uploads` (3 dòng) → **không xuất hiện** trên trang.
- E-invoice **đồng bộ từ TCT** ghi vào bảng `einvoices` → cũng không hiện trên trang.
- `documents.doc_kind` thiếu giá trị `bank_statement`; `documents.source` thiếu `ai_chat` & `tct_sync`.
- Sidebar đã có entry `Tài liệu` → giữ nguyên.

## Mục tiêu

Một trang **Tài liệu** duy nhất hiển thị MỌI file gốc / chứng từ vào hệ thống, bất kể nguồn (manual upload, chatbot AI, sync TCT, email, bank import), với preview + link tới bút toán liên quan.

## Thay đổi

### 1. Migration: mở rộng bảng `documents`

- Thêm `'bank_statement'` vào CHECK của `doc_kind`.
- Thêm `'ai_chat'`, `'tct_sync'` vào CHECK của `source`.
- Thêm cột `ai_upload_id uuid REFERENCES ai_uploads(id) ON DELETE SET NULL` (liên kết ngược về parse log).
- Thêm cột `einvoice_id uuid REFERENCES einvoices(id) ON DELETE SET NULL`.
- Index trên 2 cột trên.

### 2. Bridge `ai_uploads` → `documents`

Sửa `src/lib/ai/parse-document.functions.ts`, trong helper `ensureUploadRow` (chạy ngay khi nhận file):

- Sau khi upload Storage + insert `ai_uploads`, **insert thêm 1 row `documents`** với:
  - `doc_kind` map từ `kind` (`bank_statement` / `purchase_invoice` / `cash_voucher`)
  - `source = 'ai_chat'`
  - `storage_bucket = 'invoices'`, `storage_path` = path đã upload
  - `checksum_sha256 = file_hash`
  - `ocr_status` đồng bộ với `ai_uploads.status` (`parsing` → `processing`, `parsed` → `done`, `failed` → `failed`)
  - `ai_upload_id` = id vừa insert
- Khi parse xong / fail → UPDATE cả `ai_uploads` và `documents` (ocr_status + ocr_extracted = parsed json).
- Dùng `ON CONFLICT (tenant_id, checksum_sha256)` để idempotent — nếu document đã tồn tại thì chỉ update `ai_upload_id`.

### 3. Backfill dữ liệu cũ

Migration data: với mỗi `ai_uploads` chưa có `documents` tương ứng (match qua `file_path` ↔ `storage_path`), tạo row `documents` mới `source='ai_chat'`.

### 4. Bridge e-invoice TCT → `documents`

Trong `src/lib/einvoices-sync.functions.ts` (hoặc nơi insert `einvoices`):
- Khi đồng bộ về 1 e-invoice mới và có XML/PDF được tải xuống bucket `einvoices` → insert thêm `documents` row `source='tct_sync'`, `doc_kind='einvoice'`, `einvoice_id` set.
- Nếu chưa có flow tải file → bỏ qua bước này (vẫn an toàn, chỉ là không có file gốc để xem).

### 5. UI trang `/documents`

- Thêm filter **Nguồn** (`source`): All / Upload tay / Chatbot AI / Sync TCT / Email / Bank import.
- Cột bảng thêm icon nguồn (chatbot, sync, manual) thay vì chỉ text mờ.
- Drawer:
  - Tab **OCR**: nếu có `ai_upload_id`, hiển thị thêm `parser_used`, `pages`, `parser_ms`, link "Parse lại" (gọi `parseDocument` với base64 mới từ Storage).
  - Tab **Liên kết**: nếu có `einvoice_id`, hiển thị link tới `/einvoices/$id`.
- Header: nút **"Tải lên"** mở dialog upload thủ công (bucket `invoices`, doc_kind chọn từ dropdown) — bổ sung server fn `uploadDocument`.

### 6. Composer chatbot

Sau khi parse xong, nút **"Xem file gốc"** trong `parse-progress-dialog` đổi thành 2 nút: "Xem file" (signed URL như hiện tại) + "Mở trong Tài liệu" → `/documents?highlight={document_id}`.

## File đụng tới

- `supabase/migrations/<ts>_documents_unify.sql` (mới)
- `src/lib/ai/parse-document.functions.ts` (sửa `ensureUploadRow` + error path)
- `src/lib/einvoices-sync.functions.ts` (thêm bridge documents — nếu có file)
- `src/lib/documents.functions.ts` (thêm filter `source`, server fn `uploadDocument`, `reparseDocument`)
- `src/routes/_app/documents/index.tsx` (filter Nguồn, icon, tab OCR enrich, nút upload, highlight)
- `src/components/chat/parse-progress-dialog.tsx` (thêm nút "Mở trong Tài liệu")

## Không đụng

- Cấu trúc bucket `invoices` / `einvoices`.
- RLS hiện tại.
- Bảng `ai_uploads` (chỉ thêm liên kết 1 chiều từ `documents`).
- Logic phân loại / dedupe trong classify-import.
