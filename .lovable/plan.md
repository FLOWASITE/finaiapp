## Mục tiêu
Đưa Form "Thêm mới Khách hàng" và "Thêm mới Nhà cung cấp" đạt chuẩn một phần mềm kế toán VN (tương đương MISA / Fast / Xero), với:
- Tra cứu Mã số thuế (MST) tự động điền tên/địa chỉ.
- Đầy đủ trường nghiệp vụ: mã đối tượng, người đại diện, tài khoản ngân hàng, hạn TT, tiền tệ, dư đầu kỳ Nợ/Có, tài khoản công nợ mặc định, ghi chú.
- Form 2 cột, chia tab (Thông tin chung / Liên hệ – Địa chỉ / Ngân hàng / Kế toán), validate rõ ràng.

## Hiện trạng
- **Khách hàng** (`customers/index.tsx`): form đã tương đối đủ (code, MST, email, address, payment_terms_days, currency, opening_balance, notes), nhưng:
  - Thiếu: tài khoản ngân hàng, tên ngân hàng/chi nhánh, người đại diện pháp luật, mã số khách hàng auto-gen, loại đối tượng (Cá nhân/DN), TK công nợ mặc định (131), dư đầu kỳ Nợ/Có riêng, fax/website.
  - Validate yếu, không hiển thị lỗi tại field, không có tab.
- **Nhà cung cấp** (`suppliers/index.tsx`): rất sơ sài — chỉ có name, tax_id, email, phone, address, payment_terms_days. Thiếu code, contact_person, currency, opening_balance, ngân hàng, TK công nợ 331, ghi chú, is_active.
- Bảng `suppliers` chỉ có: name, tax_id, email, phone, address, payment_terms_days → cần mở rộng schema.
- Bảng `customers` đã có sẵn nhiều cột; chỉ cần thêm vài cột ngân hàng + TK công nợ.

## Phạm vi thay đổi

### 1. Migration database
Mở rộng `public.suppliers` thêm các cột:
```
code text,                 -- Mã NCC (unique theo user_id)
contact_person text,
website text,
fax text,
bank_account_no text,
bank_name text,
bank_branch text,
currency text not null default 'VND',
opening_balance_debit numeric not null default 0,   -- Ứng trước cho NCC (TK 331 dư Nợ)
opening_balance_credit numeric not null default 0,  -- Phải trả (TK 331 dư Có)
payable_account text not null default '331',
notes text,
is_active boolean not null default true,
party_type text not null default 'company'         -- 'company' | 'individual'
```
+ Index `(user_id, code)` unique khi `code` không null.

Mở rộng `public.customers` thêm:
```
website text,
fax text,
bank_account_no text,
bank_name text,
bank_branch text,
opening_balance_debit numeric not null default 0,   -- Phải thu (131 dư Nợ)
opening_balance_credit numeric not null default 0,  -- Khách trả trước (131 dư Có)
receivable_account text not null default '131',
party_type text not null default 'company',
legal_rep text                                       -- người đại diện pháp luật
```
Backfill `opening_balance_debit = greatest(opening_balance,0)`, `credit = greatest(-opening_balance,0)` (giữ cột cũ `opening_balance` để tương thích).

### 2. Server functions
- `src/lib/purchases.functions.ts` — mở rộng `SupplierSchema` đồng bộ cột mới, cập nhật `listSuppliers` trả thêm cột, `upsertSupplier` ghi đầy đủ + check trùng `code` thân thiện.
- `src/lib/customers.functions.ts` — mở rộng `CustomerSchema` (website, fax, bank_*, opening_balance_debit/credit, receivable_account, party_type, legal_rep).
- Cả 2 schema dùng Zod, validate: `code` regex `^[A-Z0-9_\-./]+$` ≤ 32, `tax_id` 10 hoặc 13 số (sau khi strip), email format, currency ISO 3-8, payment_terms 0..365, opening balances ≥ 0 và không đồng thời > 0.

### 3. Component dùng chung
Tạo `src/components/party-form.tsx` — form 2 cột, tab dùng `Tabs` shadcn:
- **Tab "Thông tin chung"**: Loại đối tượng (Doanh nghiệp/Cá nhân) → toggle hiển thị MST/CCCD; Mã đối tượng (* auto-suggest KH001/NCC001), Tên (*), MST + nút tra cứu (auto-fill Tên + Địa chỉ + Người đại diện qua `TaxIdLookupInput.onResolved`), Người đại diện pháp luật, Người liên hệ, Website, Trạng thái (Switch is_active).
- **Tab "Liên hệ & Địa chỉ"**: Email, Email CC, Điện thoại, Fax, Địa chỉ (textarea).
- **Tab "Ngân hàng"**: Số TK, Tên ngân hàng, Chi nhánh (cho phép thêm nhiều dòng phase 2 — phase 1 chỉ 1 dòng).
- **Tab "Kế toán"**: Tiền tệ (Select VND/USD/EUR…), Hạn TT (ngày), TK công nợ mặc định (131 cho KH / 331 cho NCC, dùng `CoaCombobox` lọc theo loại), Dư đầu kỳ Nợ, Dư đầu kỳ Có, Ghi chú.
- Hiển thị **lỗi validate inline** dưới mỗi field (dùng react-hook-form + zodResolver) thay vì chỉ toast.
- Nút "Lưu & Thêm mới" + "Lưu" + "Huỷ" ở footer.

Tham số: `mode: 'customer' | 'supplier'`, `initial`, `onDone` → component tự chọn server fn và nhãn.

### 4. Wire lại các trang
- `customers/index.tsx`: thay `CustomerForm` cũ bằng `<PartyForm mode="customer" .../>`. Bảng list thêm cột "Dư đầu kỳ Nợ/Có" hiển thị riêng.
- `suppliers/index.tsx`: thay form inline bằng `<PartyForm mode="supplier" .../>`. Bảng thêm cột Mã, Dư đầu kỳ.
- `QuickCreateButton` trong `customer-combobox.tsx`: dùng lại `PartyForm` (compact = true ẩn các tab phụ, chỉ giữ tab Chung).

### 5. Tra cứu MST — cải thiện
`TaxIdLookupInput` đã có. Mở rộng `onResolved` trong form để tự fill:
- `name` (nếu trống), `address` (nếu trống), `legal_rep` (từ `director` của TTDN), `party_type = 'company'`.

## Ngoài phạm vi (phase sau)
- Multi bank-account per party (bảng `party_bank_accounts`).
- Lịch sử thay đổi (audit hiện có ở DB).
- Import/Export CSV.
- Phân nhóm khách/NCC (customer_group).

## QA
- 360px: form 1 cột, tabs scroll ngang.
- 768/1280: 2 cột.
- Tạo mới NCC qua MST `0312345678` → fill Tên + Địa chỉ.
- Lưu KH thiếu Tên → hiện lỗi inline, không gọi server.
- Mã trùng → toast lỗi rõ "Mã đã tồn tại".
- Đặt dư đầu kỳ Nợ 1tr, Có 500k → báo lỗi (chỉ 1 bên > 0).
- Sửa KH cũ vẫn load đúng các trường mới (NULL → default).

## Các bước thực hiện
1. Migration mở rộng schema + backfill (yêu cầu approve).
2. Cập nhật 2 file `*.functions.ts` (schema + select).
3. Tạo `src/components/party-form.tsx`.
4. Thay form ở `customers/index.tsx`, `suppliers/index.tsx`, `customer-combobox.tsx`.
5. Cập nhật bảng list (thêm cột Mã / Dư đầu kỳ).
6. QA mobile + desktop.
