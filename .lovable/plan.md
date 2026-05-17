## Giai đoạn 2 — Multi-tenancy (một tài khoản, nhiều tổ chức)

Cho phép một user thuộc nhiều tổ chức với vai trò khác nhau, chuyển đổi tổ chức trong header, và mọi dữ liệu nghiệp vụ được phân tách theo `tenant_id` thay vì `user_id`.

### 1. Schema mới

```text
tenants
  id, name, company_name, tax_id, address, phone,
  accounting_standard, base_currency, fiscal_year_start,
  logo_url, signature_url, stamp_url,
  legal_rep_name, chief_accountant_name, preparer_name,
  owner_user_id, created_at

tenant_members
  id, tenant_id, user_id, role (owner|admin|accountant|viewer),
  status (active|invited|disabled), created_at
  UNIQUE(tenant_id, user_id)

profiles
  + active_tenant_id uuid  -- tổ chức đang chọn
```

- Hàm bảo mật: `is_tenant_member(_uid, _tid)`, `has_tenant_role(_uid, _tid, _roles[])`, `current_tenant_id()` (đọc `profiles.active_tenant_id`).
- `user_invitations` mở rộng: thêm `tenant_id`.

### 2. Migration dữ liệu

- Với mỗi user hiện có: tạo 1 `tenants` từ `profiles` (company_name/tax_id/...), thêm `tenant_members(role=owner)`, set `profiles.active_tenant_id`.
- Thêm cột `tenant_id uuid` (nullable trước) vào tất cả bảng nghiệp vụ:
  `invoices, invoice_lines (qua invoice), sales_invoices, sales_invoice_lines, journal_entries, journal_lines, bank_accounts, bank_transactions, cash_vouchers, customers, suppliers, supplier_payments, products, stock_movements, fixed_assets, depreciation_entries, employees, payroll_runs, payroll_lines, exchange_rates, period_locks, report_snapshots, report_notes, ai_suggestions`.
- Backfill `tenant_id = (tenant của owner = user_id)`.
- Sau backfill: `NOT NULL` + index `(tenant_id)` + `(tenant_id, created_at)` cho bảng lớn.

### 3. RLS viết lại

Thay thế `auth.uid() = user_id` bằng:
```sql
USING (is_tenant_member(auth.uid(), tenant_id))
WITH CHECK (is_tenant_member(auth.uid(), tenant_id)
            AND tenant_id = current_tenant_id())
```
- Hành động ghi (insert/update/delete) chỉ cho `owner|admin|accountant`; `viewer` chỉ select.
- `period_locks` chỉ `owner|admin`.
- `audit_logs` ghi thêm `tenant_id` qua trigger.

### 4. Server functions

`src/lib/tenants.functions.ts`:
- `listMyTenants()` — trả tenants user thuộc về + role + active flag.
- `switchTenant({ tenantId })` — kiểm tra membership, update `profiles.active_tenant_id`.
- `createTenant({ name, ... })` — tạo tenant + membership owner; set active.
- `inviteMember({ tenantId, email, role })`, `acceptInvitation({ token })`, `removeMember`, `updateMemberRole`.
- `updateTenantProfile({ ... })` — chỉ owner/admin.

Cập nhật server fns hiện có (sales/invoices/reports/...) để đọc `current_tenant_id()` và set `tenant_id` khi insert.

### 5. UI

- `<TenantSwitcher />` ở `AppHeader`: dropdown các tổ chức, nút "Tạo tổ chức mới", hiển thị role.
- `/settings/organization`: chỉnh sửa tenant hiện hành (thay cho việc edit profile công ty).
- `/settings/members`: danh sách thành viên, mời, đổi role, gỡ.
- `/onboarding/create-tenant`: hiện khi user chưa có tenant nào (edge case).
- Superadmin → Organizations: đổi từ "list profiles" sang "list tenants" với stats Giai đoạn 1; cho phép xem thành viên của mỗi tenant.

### 6. Cache & state

- `useTenant()` hook đọc `profiles.active_tenant_id` (react-query, key `['active-tenant']`).
- Khi `switchTenant` xong: `queryClient.invalidateQueries()` toàn bộ + `router.invalidate()` để reload mọi loader.

### 7. Triển khai theo bước (mỗi bước có migration riêng để rollback)

```text
B1. Tạo tenants + tenant_members + helpers + RLS cho 2 bảng đó.
B2. Migration backfill: tạo tenant per-user, gán active_tenant_id.
B3. Thêm cột tenant_id (nullable) + backfill cho TẤT CẢ bảng nghiệp vụ.
B4. Thêm RLS mới song song với RLS cũ (cùng đúng → không vỡ).
B5. Cập nhật server fns + UI: TenantSwitcher, settings/organization, members.
B6. Set tenant_id NOT NULL, gỡ RLS cũ user_id, gỡ logic user_id ở code.
B7. Superadmin Organizations chuyển sang tenants + tab thành viên.
```

### 8. Rủi ro & lưu ý

- **Khối lượng RLS lớn** — viết script kiểm thử per-table trước khi drop policy cũ.
- **invoice_lines / journal_lines** dùng RLS qua parent: giữ pattern đó, không cần thêm `tenant_id` ở bảng con (tuỳ chọn để tăng tốc query).
- **Period locks** hiện theo user_id → chuyển theo tenant_id (1 khoá kỳ áp dụng cho cả tenant).
- **Audit logs** cần `tenant_id` để superadmin lọc theo tổ chức.
- Bước B6 là điểm "không quay lại" — chỉ chạy khi B1–B5 đã verify trên dữ liệu thật.

Sau khi bạn duyệt, mình sẽ bắt đầu bằng **B1 + B2** (tạo bảng tenants, helpers, migration backfill) và dừng để bạn kiểm tra trước khi đụng vào các bảng nghiệp vụ.
