## Mục tiêu

Nâng cấp `/superadmin/accounts` (hiện chỉ có list + role toggle + ban + reset + delete) thành phân hệ quản lý tài khoản đầy đủ cho quy mô 500–5,000 user.

## Phạm vi 4 nhóm tính năng

### 1. Trang chi tiết tài khoản — `/superadmin/accounts/$id`
Drawer mở từ bảng list (hoặc trang riêng) gồm 4 tab:
- **Hồ sơ**: email, display_name, company_name, phone, job_title, tax_id, created_at, last_sign_in_at, email_confirmed_at, MFA status, banned_until.
- **Tenants & vai trò**: bảng liệt kê tất cả tenant user thuộc về (qua `tenant_members` / `user_roles` + `profiles.active_tenant_id`), role tại mỗi tenant, quick action "Đổi role tại tenant này", "Gỡ khỏi tenant".
- **Phiên & bảo mật**: danh sách session active (auth.sessions qua admin API), IP + User-Agent + thời điểm, nút **Force logout all sessions**, nút **Reset MFA factors**, lịch sử đăng nhập 30 ngày gần nhất.
- **Nhật ký**: 50 dòng `audit_logs` gần nhất do user này thực hiện (filter `actor_id`).

### 2. Tạo & mời user mới — Dialog "Mời tài khoản"
Form gồm: email, display_name (tùy chọn), tenant (combobox tenant đã có hoặc bỏ trống = chưa gắn), role mặc định, checkbox "Cấp superadmin" (cảnh báo).
- Submit → `supabaseAdmin.auth.admin.inviteUserByEmail(email)` → tạo bản ghi `profiles` + `user_roles` (nếu chọn) → log audit.
- Hiển thị toast với link invite (fallback nếu email chưa cấu hình).
- Validate: email hợp lệ, không trùng user đã tồn tại (tra trước qua list).

### 3. Filter nâng cao + bulk + export — Bảng chính
- **Filter bar**: search (đã có), role multi-select, trạng thái (Hoạt động / Chưa xác thực / Đã khóa / Có MFA), khoảng ngày tạo, last login (chưa từng / 7 ngày / 30 ngày / 90+ ngày).
- **Sort cột**: email, company, created_at, last_sign_in_at.
- **Pagination server-side** (50/trang) — đổi `listAllAccounts` thành nhận `{ page, pageSize, q, roles, status, createdRange, lastLoginBucket }`, vẫn dùng `auth.admin.listUsers` rồi lọc/sort trong server fn (≤5k user nên acceptable; thêm cache 30s).
- **Bulk select**: checkbox đầu mỗi dòng + checkbox "Chọn tất cả trang". Action bar nổi khi có chọn: Khóa, Mở khóa, Gỡ role, Cấp role, Gửi reset password, Xóa (kèm dialog xác nhận nhập "DELETE N accounts").
- **Export CSV**: server fn `exportAccountsCsv` trả CSV theo filter hiện tại (không bulk-select riêng).

### 4. Bảo mật & multi-tenant roles
- **Force logout**: `supabaseAdmin.auth.admin.signOut(user_id, 'global')` — thao tác đơn lẻ trên chi tiết.
- **Reset MFA**: liệt kê factors qua `auth.admin.mfa.listFactors`, nút xóa từng factor; cảnh báo user sẽ mất 2FA.
- **Matrix tenant × role**: tại tab "Tenants & vai trò" hiển thị mỗi tenant một dòng với select role (owner/admin/accountant/viewer). Lưu qua `setUserRoleInTenant({ user_id, tenant_id, role })` — server fn mới, ghi `user_roles` scoped (hiện schema `user_roles` không có `tenant_id`; xem mục Schema bên dưới).

## Schema thay đổi (1 migration nhỏ)

`user_roles` hiện không có `tenant_id`. Để hỗ trợ role per-tenant cần:
```
ALTER TABLE public.user_roles
  ADD COLUMN tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.user_roles
  DROP CONSTRAINT user_roles_user_id_role_key,
  ADD CONSTRAINT user_roles_user_role_tenant_key UNIQUE (user_id, role, tenant_id);
CREATE INDEX idx_user_roles_tenant ON public.user_roles(tenant_id);
```
- `superadmin` giữ `tenant_id = NULL` (global).
- Cập nhật `has_role()` để vẫn hoạt động (role match bất kể tenant) + thêm `has_role_in_tenant(user_id, role, tenant_id)`.
- Backfill: gán `tenant_id = profiles.active_tenant_id` cho các role hiện có (trừ superadmin).

> Nếu thay đổi schema này quá lớn, có thể **defer** sang giai đoạn 2 và phase 1 chỉ làm role global như hiện tại — đợi xác nhận.

## Server functions mới (trong `src/lib/superadmin.functions.ts`)
- `getAccountDetail({ user_id })` — trả profile, tenants[], roles[], sessions[], mfa_factors[], recent_audits[].
- `listAccountsPaged({ page, pageSize, filters })` — thay/phụ trợ `listAllAccounts`.
- `inviteAccount({ email, display_name?, tenant_id?, role? })`.
- `bulkAccountAction({ user_ids, action })` — action ∈ ban/unban/delete/reset_password/set_role.
- `exportAccountsCsv(filters)` — trả `{ csv: string }`.
- `forceLogoutAccount({ user_id })`.
- `listMfaFactors({ user_id })` / `resetMfaFactor({ user_id, factor_id })`.
- `setUserRoleInTenant({ user_id, tenant_id, role, enable })` (nếu làm phase 1 multi-tenant).
- Tất cả qua `assertSuperadmin` + ghi `logSuperadminAction`.

## Files thay đổi
- **Edit**: `src/lib/superadmin.functions.ts` (thêm 8 server fn).
- **Edit**: `src/routes/_app/superadmin/accounts.tsx` (filter bar + bulk + pagination + export + nút "Mời").
- **Create**: `src/routes/_app/superadmin/accounts.$id.tsx` (trang chi tiết, 4 tab).
- **Create**: `src/components/superadmin/invite-account-dialog.tsx`.
- **Create**: `src/components/superadmin/bulk-action-bar.tsx`.
- **Create**: `src/components/superadmin/account-filters.tsx`.
- **Migration**: `user_roles.tenant_id` + cập nhật `has_role` (nếu chọn làm).

## Bảo mật
- Toàn bộ server fn check `assertSuperadmin`.
- Mọi mutation ghi `audit_logs` qua `logSuperadminAction`.
- Bulk delete yêu cầu nhập chính xác chuỗi xác nhận.
- Không cho phép tự khóa/xóa/gỡ superadmin của chính mình (đã có guard, mở rộng cho bulk).
- Export CSV chỉ chứa metadata (không hash password, không token).

## Câu hỏi cần xác nhận trước khi build
1. Có làm **schema multi-tenant `user_roles.tenant_id`** ngay phase 1, hay tạm dùng role global (matrix tenant chỉ hiển thị tenants thuộc về, không đổi role per-tenant)?
2. Tạo trang chi tiết dạng **route riêng `/accounts/$id`** hay **drawer/sheet** mở trên cùng trang list?
