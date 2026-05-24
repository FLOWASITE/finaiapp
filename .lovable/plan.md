## Mục tiêu
Tự động chạy OCR + AI parse ngay sau khi user tải hóa đơn/tài liệu lên (không cần bấm "Phân tích lại" thủ công).

## Cách tiếp cận
Kích hoạt pipeline parse ngay trong server function `uploadDocument` — sau khi insert row `documents` thành công, gọi luôn `parseFileCore` (cùng pipeline mà `reparseDocument` đang dùng). Trả kết quả về client để UI hiển thị trạng thái đã OCR ngay lập tức.

## Thay đổi

**`src/lib/documents.functions.ts` — `uploadDocument` handler**
- Sau bước insert `documents` (đã có `row.id`):
  - Map `doc_kind` → `kind` cho parser (`purchase_invoice` / `bank_statement` / `cash_voucher` / `auto`) — giống `reparseDocument`.
  - Set `ocr_status = 'processing'` trên row vừa tạo.
  - Gọi `parseFileCore({ fileBase64, mimeType, filename, kind, supabase, userId })` trong try/catch.
  - Thành công: nếu doc chưa có `ai_upload_id`, update `documents` với `ocr_status='done'`, `ocr_extracted`, `ai_upload_id` (đúng pattern `reparseDocument`).
  - Lỗi: update `ocr_status='failed'`, `ocr_error=<message>`; không throw để upload vẫn coi là thành công (file đã lên storage + có row).
- Return shape mở rộng: `{ id, ocr_status, parser?, pages?, error? }` để UI biết trạng thái.

**`src/routes/_app/documents/index.tsx` — `UploadDialog.submit`**
- Sau khi upload từng file, đọc `ocr_status` trong kết quả:
  - `done` → đếm vào `okCount` và message "Đã tải lên & OCR ... file".
  - `failed` → vẫn đếm upload OK nhưng `toast.warning(${file}: OCR lỗi — có thể chạy lại từ chi tiết)`.
- Sau vòng lặp invalidate cả `["documents"]` và `["sidebar-counts"]` để badge Inbox cập nhật.

## Lưu ý kỹ thuật
- `parseFileCore` chạy đồng bộ trong request → upload nhiều file sẽ chậm hơn (tuần tự, mỗi file vài giây). Chấp nhận trade-off để giữ luồng đơn giản, không cần queue/cron. Nếu sau này cần async, sẽ chuyển sang background job riêng.
- Không đụng đến `reparseDocument` — nó vẫn dùng được khi user muốn parse lại thủ công.
- Không thay đổi schema DB, không cần migration.

## Acceptance
- Upload 1 file PDF hóa đơn → ngay khi dialog đóng, row mới xuất hiện trong danh sách với badge **OCR: Hoàn tất** và badge **Hạch toán: Chờ duyệt X%** (nhờ engine đã wire ở bước trước).
- Upload file lỗi parse (ví dụ ảnh trống) → row vẫn xuất hiện, badge **OCR: Lỗi**, có nút "Phân tích lại" trong drawer.
