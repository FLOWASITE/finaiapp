## Mục tiêu

Khi user upload chứng từ qua chatbot, **trước khi vào màn xem lại**, hệ thống phải tự động cho biết:

1. **Sao kê này thuộc tài khoản ngân hàng nào** (match với `bank_accounts` đã có, hay là TK mới).
2. **File này đã từng được upload chưa** (file-hash dedupe).
3. **Hoá đơn / phiếu này đã ghi sổ chưa** (nghiệp vụ-level dedupe).
4. **Đợt sao kê này có overlap với kỳ đã import trước không** (vd: lần 1 import 01–15/05, lần 2 import 01–31/05 → cảnh báo 15 ngày trùng và đề xuất chỉ giữ phần mới).

Toàn bộ kết quả hiển thị ở **một bước "Phân loại & đối chiếu" mới** chen giữa phase `parsing` và phase `ready` của `ParseProgressDialog`.

---

## UX

Sau khi parse xong, dialog thêm một panel **"Phân loại chứng từ"** cho từng file:

```text
📄 sao-ke-vietcombank-052026.pdf
   ✓ Loại: Sao kê ngân hàng
   ✓ Khớp TK: Vietcombank — 0011004xxxxxx  [Đổi]
   ⚠ Trùng file: đã upload ngày 12/05 (cùng hash)            [Bỏ qua / Ghi đè]
   ⚠ Overlap kỳ: 15 GD từ 01–15/05 đã có trong sổ           [Bỏ trùng / Giữ tất cả]
   ℹ Còn lại 16 GD mới sẽ đưa vào màn xem lại

📄 hoa-don-A-2026-00123.pdf
   ✓ Loại: Hoá đơn mua
   ⚠ Trùng hoá đơn: invoice_no=A-2026-00123, MST 0312…, đã ghi sổ 18/05  [Bỏ qua]
   → Mở phiếu cũ
```

User chọn hành động cho từng cảnh báo (Bỏ qua / Giữ tất cả / Ghi đè) rồi bấm **"Tiếp tục xem lại"**. Chỉ những file & dòng KHÔNG bị "Bỏ qua" mới được nạp vào `__lastBatchImport` cho `/import/preview` hoặc `/bank/import-statement`.

Khi tất cả các file đều trùng 100% → nút continue chuyển thành **"Mở chứng từ cũ"** thay vì xem lại.

---

## Phân loại & matching

### A. Bank account matching (cho `bank_statement`)

Schema sao kê đã có `account_number`, `bank_name`, `account_holder` (xác nhận trong `BankStatementSchema`).

Logic match (server-side, server fn mới `classifyImports`):
1. Chuẩn hoá `account_number` → bỏ khoảng trắng, dấu chấm, leading zeros.
2. Match exact với `bank_accounts.account_no` chuẩn hoá tương tự trong cùng tenant.
3. Nếu không match → fuzzy theo `bank_name` + 4 số cuối account.
4. Nếu vẫn không match → trả về `unknown` + gợi ý "Tạo TK ngân hàng mới" (mở dialog tạo nhanh).
5. Nếu match nhiều (cùng số TK ở 2 currency) → để user chọn.

Khi user xác nhận, `bankAccountId` được preload vào `/bank/import-statement` (hiện trang đang yêu cầu chọn thủ công).

### B. File-level dedupe (mọi loại)

Đã có `ai_uploads.file_hash` (sha256 base64). Server fn mới `lookupFileHash(hash)` trả về upload trước đó (nếu có) gồm: ngày upload, kind, và link tới chứng từ đã tạo (nếu đã post).

→ Nếu trùng & đã post → khuyến nghị **"Bỏ qua, mở chứng từ cũ"**.
→ Nếu trùng nhưng chưa post → khuyến nghị **"Tiếp tục review từ bản nháp cũ"**.

### C. Invoice-level dedupe (cho `purchase_invoice`)

Match theo `(tenant_id, supplier_tax_id, invoice_no)` — đây là khoá kế toán chuẩn của hoá đơn VN. Fallback: `(supplier_name normalized, invoice_no, issue_date, total)` khi thiếu MST.

→ Nếu tìm thấy → cảnh báo + cung cấp link mở `/purchases/:id`.

### D. Bank-transaction overlap (cho `bank_statement`)

Sau khi đã chốt `bank_account_id`, server fn `detectTxnOverlap(bank_account_id, txns[])`:
1. Lấy `bank_transactions` đã có trong khoảng `[min(date), max(date)]`.
2. Với mỗi GD trong sao kê mới, tính hash `sha1(date|amount|normalize(description))`.
3. Đánh dấu các GD có hash trùng → flag `duplicate_in_db: true` + `existing_txn_id`.

UI mới mặc định **bỏ tick** các dòng `duplicate_in_db` trong `/bank/import-statement` (chứ không xoá), cho phép user tự bật lại nếu muốn ghi đè.

Đồng thời hiển thị tóm tắt: "Phát hiện 15/31 GD đã có trong sổ — sẽ chỉ tạo 16 phiếu mới."

---

## Các thay đổi chính

### Database (1 migration)

- Thêm cột `file_hash text` vào `invoices`, `bank_vouchers`, `cash_vouchers` + index, để check trùng nhanh khi cùng 1 file đã từng tạo bút toán.
- Thêm unique index *partial* trên `invoices (tenant_id, supplier_tax_id, invoice_no) WHERE status <> 'void' AND supplier_tax_id IS NOT NULL AND invoice_no IS NOT NULL` — chỉ là **soft guard**: trigger raise warning, không chặn cứng (cho phép insert nhưng UI cảnh báo trước).
- Bảng mới `import_batches (id, tenant_id, user_id, kind, file_hash, filename, classification jsonb, decisions jsonb, status, created_at)` để lưu lịch sử mỗi lần classify → cho phép resume & audit.

### Server functions mới (file `src/lib/ai/classify-import.functions.ts`)

- `classifyImports({ items: ParsedItem[] })` → trả `ClassificationResult[]` chứa: `kind`, `file_hash_match`, `bank_account_match`, `invoice_duplicate`, `txn_overlap_summary`, `suggested_action`.
- `lookupExistingInvoice({ supplier_tax_id, invoice_no, total })`.
- `detectTxnOverlap({ bank_account_id, txns })`.
- `resolveBankAccount({ account_no, bank_name })` — match + tạo mới nhanh.

Tất cả dùng `requireSupabaseAuth` middleware, scope theo `current_tenant_id()`.

### Frontend

- `src/components/chat/classify-panel.tsx` (mới) — bảng phân loại + cảnh báo + action picker per file.
- `src/components/chat/parse-progress-dialog.tsx` — thêm phase thứ 3 `"classifying"` (giữa `parsing` & `ready`); khi ở phase này render `ClassifyPanel`.
- `src/components/chat/composer.tsx` — sau khi parse xong, gọi `classifyImports`, set phase `"classifying"`, đợi user confirm rồi mới set `__lastBatchImport` (đã được lọc/đánh dấu) và chuyển phase `"ready"`.
- `src/routes/_app/bank.import-statement.tsx` — đọc thêm `batch.bankAccountId` để preselect TK; đọc `r.duplicate_in_db` để uncheck mặc định và hiển thị badge "Đã có trong sổ".
- `src/routes/_app/import.preview.tsx` — hiển thị badge "Trùng" cho purchase invoice trùng + nút "Mở chứng từ cũ".

### Schema parse (`parse-document.functions.ts`)

`BankStatementSchema` đảm bảo có: `bank_name`, `account_number`, `account_holder`, `currency`, `period_from`, `period_to`. Nếu chưa có → thêm.

---

## Edge cases

- **Sao kê 2 trang đầu/cuối thiếu số TK**: dùng vision lần 2 chỉ trên 2 trang đầu để trích metadata, hoặc fallback hỏi user chọn TK thủ công.
- **Cùng 1 file PDF nhiều hoá đơn**: lookup duplicate theo từng line `invoice_no` riêng.
- **User cố tình re-import để sửa**: cho phép "Ghi đè" — sẽ void chứng từ cũ rồi tạo mới (giữ trace qua `void_reason = 'Re-import từ batch X'`).
- **Period đã khoá**: nếu chứng từ trùng nằm trong kỳ đã `closed` → khoá hẳn nút "Ghi đè", chỉ cho "Bỏ qua".

---

## Phạm vi KHÔNG làm trong vòng này

- Không auto-merge sao kê từ nhiều file thành 1 batch (giữ từng file riêng — đã có flow per-file "Tạo bút toán").
- Không tự đoán partner/MST từ description sao kê (đã có `suggestCounterAccount` riêng).
- Không thay đổi luồng AI memory rules.
