# Phân hệ Admin — Kế hoạch xây dựng

## Mục tiêu
Hai cấp admin:
- **Super-admin (platform):** quản trị toàn hệ thống SaaS (mọi user/tenant).
- **Owner (tenant):** quản trị nội bộ công ty (mời nhân viên, phân quyền, khóa kỳ, audit).

Bộ vai trò mở rộng: `owner / accountant / approver / viewer / superadmin`.

---

## 1. Database (migration)

### 1.1 Mở rộng enum `app_role`
Thêm: `accountant`, `approver`, `viewer`, `superadmin` (giữ `owner`).

### 1.2 Bảng `audit_logs`
- `user_id`, `actor_email`, `action` (insert/update/delete/login/lock/role_change…)
- `table_name`, `record_id`, `before` jsonb, `after` jsonb
- `ip`, `user_agent`, `created_at`
- RLS: owner xem log của tenant mình; superadmin xem tất cả.

### 1.3 Bảng `user_invitations`
- `email`, `role`, `invited_by`, `tenant_owner_id`, `token`, `accepted_at`, `expires_at`.
- RLS: owner tạo/xem invite của mình; người được mời xem theo token.

### 1.4 Hàm bảo mật
- `has_any_role(_user_id, _roles app_role[])`
- `is_superadmin(_user_id)` — security definer
- `log_audit(...)` — helper ghi log

### 1.5 Trigger audit
Gắn `AFTER INSERT/UPDATE/DELETE` cho các bảng nhạy cảm: `invoices`, `sales_invoices`, `journal_entries`, `payroll_runs`, `period_locks`, `user_roles`.

### 1.6 Cập nhật RLS theo role
Ví dụ `invoices`:
- `viewer`: chỉ SELECT.
- `accountant`: SELECT/INSERT/UPDATE (không DELETE khi kỳ đã khóa).
- `approver`: UPDATE field `status='approved'`.
- `owner`: full.
- `superadmin`: full xuyên tenant (chỉ qua server function admin).

---

## 2. Server functions (`src/lib/admin.functions.ts`)

- `listMembers()` — danh sách user_roles + email từ profiles.
- `inviteMember({ email, role })` — tạo invitation, gửi email (Lovable AI sinh nội dung, gửi qua link).
- `updateMemberRole({ userId, role })` — chỉ owner.
- `removeMember({ userId })`.
- `listAuditLogs({ from, to, action?, table? })`.
- `listPeriodLocks()` / `lockPeriod({ year, month, note })` / `unlockPeriod({ id })`.
- `getSystemStats()` — tổng số chứng từ, dung lượng file, số user, hoạt động 30 ngày.
- `exportTenantBackup()` — JSON dump các bảng của tenant.

### Super-admin (`src/lib/superadmin.functions.ts`)
- `listAllTenants()` — group theo owner, hiển thị usage.
- `suspendUser({ userId })`, `resumeUser({ userId })`.
- `viewTenantStats({ ownerId })`.
- Middleware kiểm tra `is_superadmin(auth.uid())` thủ công.

---

## 3. UI Routes

```
src/routes/_app/admin/
  index.tsx          Dashboard giám sát (stats, biểu đồ hoạt động)
  members.tsx        User & Role (mời, đổi quyền, xóa)
  audit.tsx          Audit log (filter theo action/table/user/khoảng ngày)
  periods.tsx        Khóa/mở kỳ kế toán (calendar 12 tháng × N năm)
  settings.tsx       Cấu hình hệ thống (TT133/TT200, COA template, mẫu HĐ)
  backup.tsx         Export/Backup

src/routes/_app/superadmin/
  index.tsx          Tenant list + usage
  tenant.$id.tsx     Drill-down 1 tenant
```

Guards:
- `_app/admin/*`: yêu cầu `has_role(owner)`.
- `_app/superadmin/*`: yêu cầu `is_superadmin()`.
- Người không đủ quyền → redirect `/` + toast.

Sidebar: thêm 2 mục "Quản trị" và "Super Admin" (chỉ hiện khi có role tương ứng).

---

## 4. UX chi tiết

**Members page**
- Bảng: Email · Vai trò (dropdown đổi inline) · Ngày tham gia · Trạng thái · Hành động.
- Nút "Mời thành viên" mở dialog (email + role). Sinh link `/invite/:token`.
- Cảnh báo khi xóa owner cuối cùng.

**Audit log**
- Filter: ngày, hành động, bảng, người dùng.
- Bảng phẳng + dialog xem diff `before` ↔ `after` (json viewer).
- Export CSV.

**Periods**
- Grid 12 ô tháng × cuộn năm. Click ô → toggle khóa, ghi note.
- Badge "🔒 Đã khóa" / "Mở".
- Khi khóa → chặn tất cả journal_entry trong tháng đó (RLS function `is_period_locked` đã có).

**Dashboard**
- Cards: số user, số hóa đơn 30 ngày, dung lượng file storage, lần đăng nhập gần nhất.
- Biểu đồ activity (Recharts) — log count theo ngày.

---

## 5. Bảo mật

- Mọi mutation đi qua `requireSupabaseAuth` → RLS backstop.
- Superadmin route gọi `supabaseAdmin` (service role) — chỉ trong server functions đã kiểm tra `is_superadmin`.
- Audit log immutable (không cho UPDATE/DELETE qua RLS, chỉ INSERT từ trigger).
- Period lock check ở RLS level đảm bảo kế toán không thể bypass khi sửa trực tiếp.

---

## 6. Thứ tự thực hiện

1. **Migration** (enum + bảng + RLS + trigger + functions).
2. **Server functions** admin + superadmin.
3. **Layout & guard** `_app/admin`, `_app/superadmin`.
4. **Members → Periods → Audit → Dashboard → Backup → Settings**.
5. **Super-admin pages** (tenant list + drill).
6. Thêm sidebar items + test 4 role.

Sau khi bạn duyệt plan, tôi sẽ chạy migration trước (cần bạn approve), rồi build UI/server functions.