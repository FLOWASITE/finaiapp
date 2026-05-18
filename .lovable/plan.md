## Mục tiêu (D)
1. Mở rộng bảng `suppliers` với các trường còn thiếu thường dùng cho NCC Việt Nam.
2. Tạo bảng kỳ kế toán chuẩn (`fiscal_years` + `fiscal_periods`) thay thế hoàn toàn `period_locks`.
3. UI quản lý NCC và quản lý kỳ.

---

## Phần 1 — Migration DB

### 1.1. Bổ sung cột cho `suppliers`
- `country` text default `'VN'`
- `tax_office` text — cơ quan thuế quản lý
- `branch_tax_id` text — MST chi nhánh/đơn vị phụ thuộc
- `default_expense_account` text — TK chi phí mặc định (vd 642, 627)
- `default_vat_rate` numeric — % VAT mặc định
- `credit_limit` numeric — hạn mức công nợ
- `blacklist_reason` text — lý do nếu `risk_flag='blacklist'`
- `contact_phone2`, `contact_email2` — liên hệ phụ
- Index: `(tenant_id, is_active)`, `(tenant_id, name)` cho tìm kiếm

### 1.2. Bảng `fiscal_years`
- `id`, `tenant_id` (NOT NULL), `user_id`
- `year` int (vd 2026) — UNIQUE `(tenant_id, year)`
- `start_date` date, `end_date` date
- `status` text CHECK in (`open`,`closed`) default `open`
- `closed_at` timestamptz, `closed_by` uuid
- `note` text
- `created_at`, `updated_at`
- Trigger validate: `end_date > start_date`, độ dài ~12 tháng

### 1.3. Bảng `fiscal_periods`
- `id`, `tenant_id` (NOT NULL), `user_id`
- `fiscal_year_id` uuid FK → `fiscal_years(id)` ON DELETE CASCADE
- `year` int, `period_no` int (1–12) — UNIQUE `(tenant_id, year, period_no)`
- `start_date`, `end_date` date
- `status` text CHECK in (`open`,`soft_closed`,`closed`) default `open`
  - `open`: ghi sổ tự do
  - `soft_closed`: chỉ chặn người dùng thường, owner/admin vẫn sửa được
  - `closed`: khoá cứng, không ai sửa
- `closed_at`, `closed_by`, `note`
- Index: `(tenant_id, year, period_no)`, `(tenant_id, status)`

### 1.4. RLS
Cả 2 bảng dùng pattern hiện hành:
- `own ... all` theo `user_id`
- `tenant ... select` qua `is_tenant_member`
- `tenant ... insert/update/delete` qua `has_tenant_role(['owner','admin'])` + `current_tenant_id()`

### 1.5. Hàm hỗ trợ + sửa `is_period_locked`
- `generate_fiscal_year(p_tenant uuid, p_year int)` — RPC: tạo 1 `fiscal_years` + 12 `fiscal_periods` theo năm dương lịch (start 01/01, end 31/12).
- Viết lại `is_period_locked(_user_id uuid, _date date)`:
  ```sql
  SELECT EXISTS (
    SELECT 1 FROM fiscal_periods fp
    JOIN profiles p ON p.active_tenant_id = fp.tenant_id
    WHERE p.id = _user_id
      AND fp.year = EXTRACT(YEAR FROM _date)
      AND fp.period_no = EXTRACT(MONTH FROM _date)
      AND fp.status IN ('soft_closed','closed')
  )
  ```
- Bổ sung `is_period_hard_locked(...)` chỉ check `closed` — để admin có thể bypass `soft_closed` sau này.

### 1.6. Migrate `period_locks` → `fiscal_periods`
- Hiện `period_locks` có **0 dòng** → không cần backfill.
- DROP TABLE `period_locks` (sau khi `is_period_locked` đã trỏ sang bảng mới).
- Gỡ trigger audit `audit_period_locks`.

### 1.7. Audit + updated_at
- Gắn `set_updated_at` trigger cho cả 2 bảng mới.
- Gắn `audit_trigger` cho `fiscal_years`, `fiscal_periods`.

---

## Phần 2 — UI

### 2.1. NCC: `src/routes/_app/suppliers/`
- `index.tsx` đã có — bổ sung các cột mới vào bảng list + bộ lọc (`is_active`, `risk_flag`, `group_id`, search theo `name`/`tax_id`/`code`).
- `$id.tsx` — form chi tiết: tabs `Thông tin chung | Tài chính | Liên hệ | Ngân hàng | Ghi chú`.
  - Tài chính: `payable_account`, `default_expense_account`, `default_vat_rate`, `credit_limit`, `payment_terms_days`, `opening_balance_*`, `currency`.
  - Liên hệ: `contact_person`, `phone`, `email`, `contact_phone2`, `contact_email2`, `website`, `fax`.
  - Ngân hàng: `bank_account_no`, `bank_name`, `bank_branch`.
  - Thông tin chung: `code`, `name`, `tax_id`, `party_type`, `legal_rep`, `address`, `country`, `tax_office`, `branch_tax_id`, `group_id`, `is_active`, `risk_flag` + `blacklist_reason`.
- Server fn: `list/get/create/update/delete` trong `src/lib/suppliers.functions.ts` (dùng `requireSupabaseAuth`).

### 2.2. Kỳ kế toán: `src/routes/_app/settings/fiscal-periods.tsx`
- Bảng năm tài chính (collapsible) → 12 ô tháng dạng grid.
- Mỗi ô tháng: badge trạng thái (open/soft_closed/closed) + nút đổi trạng thái (owner/admin).
- Nút "Tạo năm tài chính mới" → modal nhập `year` → gọi RPC `generate_fiscal_year`.
- Nút "Khoá toàn bộ năm" → set 12 tháng = `closed`.
- Hiện lịch sử ai khoá khi nào (`closed_by`, `closed_at`).
- Server fns trong `src/lib/fiscal-periods.functions.ts`:
  - `listFiscalYears`, `generateFiscalYear`, `setPeriodStatus`, `closeFiscalYear`.

### 2.3. Liên kết menu
- Thêm link `/settings/fiscal-periods` trong `settings/index.tsx`.
- Suppliers đã có sẵn ở sidebar.

---

## Phần 3 — Bảo vệ máy trạng thái chứng từ
Hàm `enforce_document_status_transition` hiện đã gọi `is_period_locked` — tự động hoạt động sau khi đổi backend của hàm này. **Không cần sửa code trigger**.

---

## Câu hỏi xác nhận
1. Trạng thái `soft_closed` có cần thật không, hay chỉ cần `open`/`closed` cho gọn?
2. Khi tạo `fiscal_year` mới, có tự sinh luôn năm dương lịch hiện tại + năm sau, hay chờ người dùng bấm nút?
3. Form NCC: chia 5 tab như trên có hợp lý, hay bạn muốn 1 form dài duy nhất với các section?
