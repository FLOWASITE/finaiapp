
# Thống nhất máy trạng thái chứng từ + bảng `documents`

Mục tiêu: mọi chứng từ (hoá đơn mua, hoá đơn bán, hoá đơn điện tử, phiếu thu/chi, phiếu ngân hàng…) đi qua **cùng một vòng đời** và mọi file gốc (PDF, XML, ảnh, Excel) được quản lý tập trung tại một bảng `documents` thay vì rải rác ở `invoices.file_path`, `einvoices.xml_path/pdf_path`.

## 1. Vòng đời chứng từ chuẩn (state machine)

Một enum duy nhất `document_status` áp cho mọi bảng chứng từ:

```text
uploaded   → file/dữ liệu vừa vào hệ thống, chưa xử lý
ai_read    → AI/OCR/XML parser đã trích xuất, chờ kế toán xem
reviewed   → kế toán đã kiểm tra & sửa, đồng ý nội dung
posted     → đã sinh bút toán (journal_entry_id NOT NULL)
locked     → kỳ kế toán đã khoá (suy ra từ period_locks; không lưu cứng)
void       → huỷ (có lý do, không sinh bút toán hoặc đã đảo bút toán)
rejected   → từ chối (sai sót, không xử lý tiếp)
```

Chuyển trạng thái hợp lệ (enforce bằng trigger `BEFORE UPDATE`):

```text
uploaded  → ai_read | reviewed | void | rejected
ai_read   → reviewed | void | rejected
reviewed  → posted | ai_read (mở lại) | void
posted    → void (đảo bút toán) | reviewed (nếu chưa khoá kỳ)
void      → (terminal)
rejected  → uploaded (mở lại) | (terminal)
```

Ràng buộc thêm:
- Không cho rời `posted` nếu kỳ kế toán đã khoá (`is_period_locked`).
- Khi vào `posted` mà `journal_entry_id IS NULL` → raise.
- Khi vào `void` → tự động xoá hoặc đảo `journal_entries` liên quan (tuỳ chọn — mặc định chặn nếu đã `posted` và chưa đảo).

## 2. Bảng `documents` thống nhất

Một bảng duy nhất quản lý mọi file đính kèm + payload trích xuất.

```text
documents
  id uuid pk
  tenant_id uuid not null
  user_id uuid not null               -- người upload
  doc_kind text not null              -- 'purchase_invoice'|'sales_invoice'|'einvoice'|'cash_voucher'|'bank_voucher'|'receipt'|'payment'|'contract'|'other'
  source text not null default 'manual' -- 'manual'|'email'|'einvoice_sync'|'bank_import'|'api'
  storage_bucket text not null        -- 'invoices'|'einvoices'|'branding'|...
  storage_path text not null          -- key trong bucket
  original_filename text
  mime_type text
  size_bytes bigint
  checksum_sha256 text                -- chống upload trùng
  ocr_status text not null default 'pending'  -- 'pending'|'processing'|'done'|'failed'
  ocr_raw jsonb                       -- payload AI/parser thô
  ocr_extracted jsonb                 -- payload đã chuẩn hoá field (số HĐ, ngày, tiền…)
  reviewed_by uuid                    -- profile id
  reviewed_at timestamptz
  notes text
  created_at timestamptz default now()
  updated_at timestamptz default now()
  unique (tenant_id, storage_bucket, storage_path)
  unique (tenant_id, checksum_sha256) where checksum_sha256 is not null
```

RLS: cùng mẫu `own … all` + 4 policy tenant như các bảng khác.

### Liên kết documents ↔ chứng từ (many-to-many)

```text
document_links
  document_id uuid → documents.id on delete cascade
  entity_table text   -- 'invoices'|'sales_invoices'|'einvoices'|'cash_vouchers'|'bank_vouchers'|'customer_receipts'|'supplier_payments'
  entity_id uuid
  link_type text default 'attachment'  -- 'source'|'attachment'|'evidence'
  created_at timestamptz default now()
  primary key (document_id, entity_table, entity_id)
```

Một file có thể đính kèm nhiều chứng từ (ví dụ 1 PDF gộp nhiều hoá đơn); một chứng từ có thể có nhiều file (PDF + XML + ảnh).

### Lịch sử trạng thái

```text
document_status_history
  id uuid pk
  tenant_id uuid not null
  entity_table text not null
  entity_id uuid not null
  from_status text
  to_status text not null
  changed_by uuid
  changed_at timestamptz default now()
  reason text
  index (entity_table, entity_id, changed_at)
```

Trigger `AFTER UPDATE` trên các bảng chứng từ → ghi vào đây mỗi khi `status` đổi.

## 3. Thay đổi trên các bảng chứng từ hiện có

- Tạo enum/`CHECK` cho cột `status` với 7 giá trị trên ở: `invoices`, `sales_invoices`, `einvoices` (đổi tên `tct_status` riêng — `tct_status` vẫn tồn tại như "trạng thái phía TCT"; thêm cột `status` chuẩn), `cash_vouchers`, `bank_vouchers`, `customer_receipts`, `supplier_payments`.
- Thêm cột `posted_at timestamptz`, `voided_at timestamptz`, `void_reason text` cho các bảng trên.
- **Backfill**:
  - `invoices.status='extracted'` → `'ai_read'`; `'failed'` → `'rejected'`; còn lại → `'uploaded'`. Nếu `journal_entry_id` (qua `journal_entries.invoice_id`) tồn tại → `'posted'`.
  - `sales_invoices`: hiện chưa có dữ liệu status → set theo `payment_status` + sự tồn tại của journal entry: có entry → `'posted'`, không → `'reviewed'`.
  - `einvoices`: `'uploaded'` mặc định; có `matched_sales_invoice_id|matched_purchase_invoice_id` → `'reviewed'`.
  - `cash_vouchers`/`bank_vouchers`/`customer_receipts`/`supplier_payments`: có `journal_entry_id` → `'posted'`, không → `'reviewed'`.
- **Không xoá** `invoices.file_path`, `einvoices.xml_path`, `einvoices.pdf_path` trong migration này — đánh dấu deprecated trong code, đồng thời backfill mỗi cột thành 1 row `documents` + 1 row `document_links` tương ứng. Xoá ở migration sau (sau khi UI/code đã chuyển hết).
- `invoices.raw_ocr` → copy sang `documents.ocr_raw` rồi giữ nguyên cột cũ (sẽ drop sau).

## 4. Trigger & function

- `enforce_document_status_transition()` — `BEFORE UPDATE` trên 7 bảng chứng từ, áp ma trận chuyển trạng thái + check `is_period_locked` + check `journal_entry_id` khi vào `posted`.
- `log_document_status_change()` — `AFTER UPDATE OF status` ghi `document_status_history`.
- `documents_set_updated_at` — trigger updated_at.
- Hàm helper RPC (gọi từ server function): `transition_document_status(p_table, p_id, p_to_status, p_reason)` → kiểm tra quyền, set status, ghi history. UI và serverFn dùng hàm này thay vì UPDATE trực tiếp cột `status`.

## 5. Server functions cần thêm/sửa

Mới (`src/lib/documents.functions.ts`):
- `uploadDocument({ kind, file, links? })` — upload vào bucket tương ứng + insert `documents` + `document_links`.
- `listDocuments({ filters })` — list theo tenant, lọc theo `doc_kind`, `ocr_status`, link tới entity.
- `linkDocument` / `unlinkDocument`.
- `transitionStatus({ table, id, toStatus, reason })` — wrap RPC.
- `getStatusHistory({ table, id })`.

Sửa các function hiện có để dùng `transitionStatus` thay vì update cột status trực tiếp: `purchases.functions.ts`, `sales.functions.ts`, `einvoices.functions.ts`, `bank.functions.ts`, `receipts.functions.ts`, `payables.functions.ts`.

## 6. UI (loop sau — không nằm trong migration)

- Badge trạng thái 7 màu thống nhất, dùng chung component `<DocStatusBadge />`.
- Filter trạng thái trên list các bảng chứng từ.
- Nút hành động theo state: "Gửi duyệt", "Duyệt", "Ghi sổ", "Huỷ", "Từ chối" — chỉ hiện nút hợp lệ với state hiện tại.
- Trang `Documents` (`/documents`): kho chứng từ gốc, xem PDF/XML, tìm theo `checksum`, gắn vào chứng từ nghiệp vụ.
- Drawer "Lịch sử trạng thái" hiển thị `document_status_history`.

## 7. Thứ tự migration

1. Migration A: tạo `documents`, `document_links`, `document_status_history`, RLS, trigger updated_at.
2. Migration B: thêm cột `status/posted_at/voided_at/void_reason` (+ CHECK) lên 7 bảng chứng từ, backfill từ dữ liệu hiện có.
3. Migration C: tạo trigger `enforce_document_status_transition` + `log_document_status_change` + RPC `transition_document_status`.
4. Tool insert: backfill `documents` từ `invoices.file_path`, `einvoices.xml_path/pdf_path`, `invoices.raw_ocr`.
5. Loop UI: server functions + component badge + filter + trang Documents.
6. Migration cuối (sau khi UI ổn): drop `invoices.file_path`, `invoices.raw_ocr`, `einvoices.xml_path/pdf_path`.

## Chi tiết kỹ thuật

- Không dùng Postgres `ENUM` type (khó migrate giá trị) → dùng `text` + `CHECK (status IN (...))`.
- Trigger transition không chạy khi `OLD.status = NEW.status` (no-op).
- Trigger `transition` cho phép bypass khi `current_setting('app.bypass_status_machine', true) = 'on'` để backfill và một số seed script dùng.
- `document_links.entity_table` không dùng FK (vì là polymorphic) — bù lại bằng trigger kiểm tra `entity_id` tồn tại trong `entity_table` cùng `tenant_id`.
- Không động vào `chart_of_accounts`, `audit_logs`, `period_locks`, `journal_entries/journal_lines`, các bảng danh mục (customers, suppliers, employees).
- `einvoices.tct_status` giữ nguyên vai trò (trạng thái phía Tổng cục Thuế) — KHÔNG đổi tên, KHÔNG gộp với `status`.

## Câu hỏi cần xác nhận

1. Trạng thái `rejected` có cần không, hay gộp vào `void`?
2. Khi `posted → void`, hệ thống nên **tự đảo bút toán** (tạo journal entry ngược dấu) hay **chặn** và yêu cầu người dùng đảo thủ công trước?
3. `documents` có cần lưu thumbnail/preview URL không (cho UI lướt nhanh), hay sinh on-demand?
4. Có muốn ép **mọi** chứng từ tạo mới đều phải gắn ít nhất 1 `documents` (ép upload file gốc), hay vẫn cho phép chứng từ "không file"?
