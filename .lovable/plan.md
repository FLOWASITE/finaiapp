
## Mục tiêu
Đưa state machine `transition_document_status` + bảng `documents` vào UI để người dùng có thể: xem trạng thái chứng từ, chuyển trạng thái qua nút hành động, và quản lý kho tài liệu tập trung.

## Phạm vi

### 1. Server functions — `src/lib/documents.functions.ts`
- `transitionStatus({ table, id, to_status, reason? })` — wrapper gọi RPC `transition_document_status`, validate bằng Zod (whitelist 7 bảng: `einvoices`, `cash_vouchers`, `bank_vouchers`, `customer_receipts`, `sales_invoices`, `purchase_invoices`, `payroll_runs` — chốt lại theo schema thực tế).
- `listDocuments({ search?, doc_kind?, ocr_status?, limit, offset })` — list `documents` theo tenant, kèm count links.
- `getDocument({ id })` — chi tiết + `document_links` + `document_status_history` của các entity liên kết.
- `getStatusHistory({ entity_table, entity_id })` — đọc `document_status_history` cho 1 chứng từ (dùng trong drawer chi tiết).
- `deleteDocument({ id })` — chặn nếu còn `document_links` đang trỏ về chứng từ đã `posted`.
- (Tuỳ chọn) `linkDocument` / `unlinkDocument` — quản lý `document_links` từ UI chứng từ.

Dùng `requireSupabaseAuth` cho mọi function.

### 2. Component dùng chung
- `src/components/doc-status-badge.tsx` — `<DocStatusBadge status="..." />` map sang variant + label tiếng Việt:
  - `uploaded` → outline "Đã tải lên"
  - `ai_read` → secondary "AI đã đọc"
  - `reviewed` → default "Đã duyệt"
  - `posted` → success "Đã ghi sổ"
  - `void` → destructive outline "Đã huỷ"
  - `rejected` → destructive "Từ chối"
- `src/components/doc-status-actions.tsx` — dropdown "Hành động" nhận `{ table, id, status, hasJournalEntry }`, hiển thị nút hợp lệ theo state machine:
  - `uploaded` → "Đánh dấu AI đã đọc", "Từ chối"
  - `ai_read` → "Duyệt", "Từ chối"
  - `reviewed` → "Ghi sổ" (mở dialog nếu chưa có journal_entry_id → điều hướng tới form post), "Huỷ duyệt"
  - `posted` → "Huỷ chứng từ" (yêu cầu lý do, dialog)
  - `void` / `rejected` → readonly
  Gọi `transitionStatus` qua `useServerFn` + `useMutation`, invalidate query list của bảng cha, toast kết quả, xử lý lỗi từ trigger (kỳ khoá, thiếu JE…).
- `src/components/doc-status-history.tsx` — timeline đọc từ `document_status_history`, dùng trong drawer/dialog chi tiết.

### 3. Tích hợp vào các trang chứng từ hiện có
Trên các bảng list của: hoá đơn bán/mua, phiếu thu/chi, chứng từ ngân hàng, e-invoice (7 bảng có cột `status`):
- Thêm cột "Trạng thái" dùng `DocStatusBadge`.
- Thêm cột "Hành động" dùng `DocStatusActions`.
- Thay mọi chỗ đang `UPDATE status` thẳng bằng `transitionStatus`.
- Trong drawer/dialog chi tiết: thêm tab/section "Lịch sử trạng thái".

### 4. Trang `/documents` — kho tài liệu
File: `src/routes/_app/documents/index.tsx` (+ `documents.$id.tsx` cho chi tiết).
- Filter: search filename, `doc_kind`, `ocr_status`, khoảng ngày.
- Bảng: tên file, loại, nguồn (`source`), OCR status, số liên kết, ngày tạo, người tạo.
- Hành động hàng: Xem trước (storage signed URL), Tải về, Xoá (có check).
- Drawer chi tiết:
  - Metadata + preview (img/pdf).
  - Tab "OCR" hiển thị `ocr_extracted` JSON.
  - Tab "Liên kết" liệt kê `document_links` (entity_table, entity_id → link sang trang chứng từ tương ứng + `DocStatusBadge` của chứng từ đó).

### 5. Điều hướng
- Thêm mục "Tài liệu" vào sidebar `_app` layout, icon `FileText`, route `/documents`.

## Ngoài phạm vi (để loop sau)
- Bulk transition.
- Upload tài liệu mới từ trang `/documents` (giữ flow upload hiện tại trong từng chứng từ).
- Reassign link giữa các chứng từ.

## Câu hỏi xác nhận trước khi build
1. 7 bảng có cột `status` chính xác là gì — cho mình dùng đúng danh sách user đã chốt trong migration vừa rồi (mình sẽ đọc lại schema để khớp, nhưng nếu user đã có list sẵn thì paste vào nhanh hơn).
2. Khi bấm "Ghi sổ" mà chứng từ chưa có `journal_entry_id`: (a) tự sinh JE từ dữ liệu chứng từ rồi transition, hay (b) chỉ điều hướng tới form hiện có để user tự post? Mặc định mình chọn (b) cho an toàn.
