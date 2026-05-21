## Mục tiêu

Khi import hoá đơn mua (XML/PDF) và mở màn `/import/preview`, hệ thống phải:
1. Dò NCC theo MST trong `public.suppliers` của tenant hiện tại → tự điền tên, TK phải trả, TK chi phí mặc định, VAT mặc định.
2. Nếu không tìm thấy NCC theo MST → gợi ý tạo nhanh NCC ngay trên card.
3. Gợi ý TK chi phí dựa trên lịch sử mua của NCC đó (TK xuất hiện nhiều nhất trong `invoices.expense_account` 12 tháng gần nhất).
4. Khi bấm **Tạo nháp**, upload file XML/PDF gốc lên bucket `invoices` và lưu `invoices.file_path` để giữ liên kết chứng từ gốc.

## Phạm vi (chỉ phần purchase_invoice)

Phiếu thu/chi tạm để sau theo lựa chọn của bạn.

## Việc cần làm

### 1. Server functions mới — `src/lib/import-preview.functions.ts`

- `lookupSupplierByTaxId({ tax_id })` — `requireSupabaseAuth`, trả `{ supplier, suggestedExpenseAccount, suggestedVatRate, suggestedPayableAccount }`.
  - Tìm trong `suppliers` (tenant scope) theo `tax_id` đã chuẩn hoá (chỉ giữ chữ số).
  - Nếu thấy: dùng `default_expense_account / default_vat_rate / payable_account` của NCC.
  - Bổ sung gợi ý theo lịch sử: top 1 `expense_account` từ `invoices` (cùng `supplier_id`, 12 tháng) — ghi đè default nếu khác.
- `quickCreateSupplier({ name, tax_id, default_expense_account?, payable_account? })` — `requireSupabaseAuth`, insert NCC mới với `tenant_id = current_tenant_id()`, trả supplier vừa tạo.

### 2. Hook UI trong `src/routes/_app/import.preview.tsx`

- Khi `drafts` được build từ batch, với mỗi invoice draft có MST → gọi `lookupSupplierByTaxId` (React Query, `staleTime: 5min`, key theo MST chuẩn hoá).
- Áp dụng kết quả: nếu `supplier_name` đang trống → điền; nếu user chưa chỉnh `expense_account` thì set theo gợi ý; tương tự `payable_account` và `lines[].vat_rate` (chỉ khi line đang = 0).
- Khi user gõ tay MST trong input → debounce 500ms, gọi lookup lại.
- Thêm chip nhỏ cạnh tên NCC:
  - Tìm thấy: `Badge` xanh "NCC #<code>" + nút "Xem".
  - Không thấy: `Badge` vàng "NCC mới" + nút "Tạo NCC từ HĐ" mở dialog ngắn (name + tax_id readonly + expense_account combo), bấm OK gọi `quickCreateSupplier` rồi re-lookup.

### 3. Upload file gốc + insert thẳng vào `invoices`

Đổi handler `submitOne` cho `purchase_invoice`:
- Nếu batch còn giữ file gốc (`window.__lastBatchImport.items[i].file` hoặc base64) → upload qua `supabase.storage.from('invoices').upload(<tenant>/<yyyy>/<filename>)` ở phía client (bucket private, RLS đã cấu hình).
- Gọi server fn mới `createPurchaseInvoiceDraft` thay vì `proposeActionFn`:
  - Validate Zod, insert `invoices` (status='reviewed', file_path nếu có, supplier_id resolved), insert `invoice_lines`, KHÔNG ghi journal (status='reviewed', để user post sau).
  - Trả `{ id }`.
- Sau khi insert thành công, set `status='done'`, hiện link "Mở chứng từ" → `/invoices/$id`.

### 4. Chuẩn hoá batch trước khi điều hướng

Trong `src/components/chat/composer.tsx` (chỗ build `lastBatchImport`), bổ sung field `file: { name, mime, base64 }` cho mỗi item để màn preview có thể upload. Giới hạn 20MB như hiện tại.

### 5. UI nhỏ

- Trên header card: thêm dòng "MST: <chip trạng thái lookup>".
- Sửa label "Nợ — TK chi phí/HH" để hiển thị suffix `(gợi ý từ lịch sử NCC)` khi suggestion áp dụng được.
- Nút "Tạo nháp" giữ nguyên text, nhưng sau khi xong hiển thị link mở chứng từ.

## Không làm trong lần này

- Không đụng phiếu thu/chi (giữ flow cũ).
- Không thay parser XML (parser hiện chưa lấy được tên NCC — sẽ xử lý ở plan riêng).
- Không tạo journal entry tự động — chứng từ tạo ở trạng thái `reviewed`, user duyệt sang `posted` ở màn chi tiết.

## Rủi ro / lưu ý kỹ thuật

- `suppliers.tax_id` chưa có unique index theo tenant → lookup dùng `.eq('tax_id', normalized).eq('tenant_id', currentTenant).limit(1)`; nếu trùng MST cảnh báo "có nhiều NCC trùng MST".
- Trạng thái chứng từ phải qua `enforce_document_status_transition`: insert mặc định `uploaded` rồi update `reviewed` trong cùng server fn (vì transition `uploaded → reviewed` hợp lệ).
- File path quy ước: `<tenant_id>/purchase/<yyyy>/<uuid>-<originalName>` để khớp RLS đang dùng `(storage.foldername(name))[1] = tenant`.
