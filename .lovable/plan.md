# Mở rộng trang Super Admin (/superadmin)

Bổ sung 3 nhóm chức năng cho khu vực Super Admin hiện có. Giữ layout tabs trong `superadmin.tsx`, mỗi nhóm là 1 route con + server functions tương ứng.

## Nhóm A — Người dùng & Bảo mật

### A1. Mở rộng `/superadmin/accounts`
Trang đã có (list, set role, reset password, ban/unban, delete). Bổ sung:
- **Lọc & sắp xếp**: theo role, trạng thái (banned/active/chưa xác thực email), lần đăng nhập gần nhất, ngày tạo.
- **Cột mới**: `last_sign_in_at`, `email_confirmed_at`, số tenant đang là thành viên.
- **Hành động hàng loạt**: chọn nhiều user → ban, force sign-out, reset password.
- **Force sign-out** 1 user (revoke refresh tokens) — server fn dùng `supabaseAdmin.auth.admin.signOut(userId, "global")`.
- **Drawer chi tiết**: hiển thị metadata, roles, tenant memberships, 10 audit log gần nhất.

### A2. Trang mới `/superadmin/security`
- **Auth policies (đọc/ghi)**: hiển thị trạng thái Password HIBP, auto-confirm email, disable signup, anonymous users — gọi `configure_auth` để chỉnh ngay trong UI.
- **Session policy**: hiển thị JWT TTL (read-only, hướng dẫn nơi đổi).
- **2FA enforcement (per-role)**: bảng `security_policies` (mới) lưu cờ `require_2fa_for_role`. UI bật/tắt theo role; phía login check sau.
- **IP allowlist (per-tenant/global)**: bảng `ip_allowlist` (mới). UI CRUD CIDR; hiển thị cảnh báo "chưa enforce" cho đến khi middleware sẵn sàng (tạo middleware ở bước sau).
- **Active sessions snapshot**: list user có session active (auth.users.last_sign_in_at trong 24h) + nút force sign-out toàn bộ.

## Nhóm B — Nhật ký & Sao lưu

### B1. Mở rộng `/superadmin/audit`
Trang đã có. Bổ sung:
- **Stats panel** đầu trang: tổng events 24h/7d/30d, top 5 actors, top 5 tables, biểu đồ sparkline theo giờ.
- **Lưu filter dạng saved view** (lưu vào localStorage).
- **Export CSV** kết quả filter hiện tại (server fn stream CSV).

### B2. Trang mới `/superadmin/backups`
- **Export toàn tenant**: chọn tenant → server fn dump các bảng chính (invoices, sales_invoices, journal_entries/lines, bank_*, customers, suppliers, products, fiscal_*) → ZIP các CSV → trả URL tải.
- **Snapshot metadata bảng `system_backups`** (mới): id, tenant_id, kind, created_by, file_path (Storage bucket `backups`, private), row_counts JSONB, status.
- **Lịch sử**: bảng list snapshot có nút tải lại / xoá.
- **Lưu ý**: chỉ export (read-only). Restore phức tạp → ghi rõ "coming soon" trên UI, không build trong scope này.
- **Storage bucket `backups`** (private) + RLS chỉ superadmin đọc.

### B3. Trang mới `/superadmin/jobs`
- Hiển thị log của các tác vụ chạy nền (rebuild MV, rebuild monthly summary, refresh account period balances).
- Nút bấm chạy thủ công các function: `rebuild_monthly_summary`, `rebuild_account_period_balances`, `refresh_report_mvs` (toàn hệ thống hoặc per-tenant).
- Bảng `system_job_runs` (mới): id, job, params, status, started_at, finished_at, error, output_summary.

## Nhóm C — Cài đặt & Billing

### C1. Trang mới `/superadmin/settings`
Bảng `system_settings` (mới, singleton id=1, JSONB key/value):
- **Branding nền tảng**: tên app, logo URL, support email, footer text.
- **Email defaults**: from name, from email (read-only nếu Lovable Email đang quản lý).
- **Feature flags**: bật/tắt module (einvoice, payroll, inventory, AI parse, AI chat) — UI tick → ảnh hưởng sidebar tenants.
- **Format mặc định**: timezone, currency, date format, locale.
- **AI usage policy**: cap số token/ngày/tenant (số), cap số file parse/ngày.
- **Tenant defaults**: số chứng từ khởi tạo, accounts mặc định khi tạo tenant mới.

### C2. Trang mới `/superadmin/billing`
Bảng `tenant_plans` + `tenant_usage` (mới):
- `tenant_plans(tenant_id, plan, seats_limit, ai_tokens_quota, storage_quota_mb, period_start, period_end, status)`.
- `tenant_usage(tenant_id, period_ym, ai_tokens_used, ai_files_parsed, storage_used_mb, documents_count, updated_at)`.
- **UI**: bảng tenants với plan hiện tại, % usage (progress bar) cho từng chỉ số, nút **Đổi plan**, **Suspend tenant**, **Cộng/Trừ quota thủ công**.
- **Bảng giá plans** (Free/Pro/Business/Enterprise) — cấu hình trong `system_settings.plans` JSON.
- **Hành động Suspend**: set `tenant.status='suspended'` (cần thêm cột) → tenants_members vẫn login nhưng đọc-only; thực thi qua RLS helper `is_tenant_suspended()`.
- **Usage collector**: server fn `collectTenantUsage()` chạy thủ công (nút trong /jobs) — đếm rows và cập nhật `tenant_usage`.

## Tab nav Super Admin sau khi xong
```
Tổng quan tenants | Tài khoản | Tổ chức | Bảo mật | AI Model | Billing | Sao lưu | Jobs | Cài đặt | Nhật ký
```
Có thể gom vào 3 dropdown: Người dùng (Tài khoản, Bảo mật) · Vận hành (Sao lưu, Jobs, Nhật ký, AI Model) · Cấu hình (Tổ chức, Billing, Cài đặt) — nếu tab list quá dài.

## Database migrations cần làm
1. `security_policies` (require_2fa_per_role JSONB, ip_allowlist_enabled bool).
2. `ip_allowlist` (id, scope `global|tenant`, tenant_id, cidr, label, created_by, created_at).
3. `system_backups` (id, tenant_id, kind, file_path, row_counts jsonb, status, created_by, created_at).
4. `system_job_runs` (id, job, params jsonb, status, started_at, finished_at, error, output jsonb, created_by).
5. `system_settings` (id=1 singleton, value jsonb, updated_at, updated_by).
6. `tenant_plans` + `tenant_usage` (cấu trúc ở trên).
7. ALTER `tenants` ADD COLUMN `status text DEFAULT 'active'` + `suspended_at timestamptz`.
8. Storage bucket `backups` (private) + policy chỉ superadmin.
9. Helper `is_tenant_suspended(_tenant uuid)` + cập nhật RLS các bảng write quan trọng để chặn ghi khi suspended.
10. Tất cả bảng mới: RLS chỉ superadmin (`is_superadmin(auth.uid())`).

## Server functions mới (file `src/lib/superadmin-extra.functions.ts`)
- A1: `forceSignOutUser`, `bulkUpdateAccounts`, `getAccountDetail`.
- A2: `getSecurityPolicies`, `updateSecurityPolicies`, `listIpAllowlist/upsert/delete`, `listActiveSessions`.
- B1: `getAuditStats`, `exportAuditCsv`.
- B2: `createTenantBackup`, `listBackups`, `deleteBackup`, `signBackupUrl`.
- B3: `runSystemJob`, `listJobRuns`.
- C1: `getSystemSettings`, `updateSystemSettings`.
- C2: `listTenantBilling`, `updateTenantPlan`, `suspendTenant`, `unsuspendTenant`, `collectTenantUsage`.

## Thứ tự thực hiện
1. **Migrations** (tất cả schema mới + RLS + bucket).
2. **Server functions** (theo nhóm A → B → C).
3. **Routes UI** (theo thứ tự `accounts` mở rộng → `security` → `audit` mở rộng → `backups` → `jobs` → `settings` → `billing`).
4. **Cập nhật `superadmin.tsx`** tab nav.
5. **Suspend enforcement**: cập nhật RLS / serverFn helper sau khi có dữ liệu mẫu để verify.
6. **Verify**: tạo 1 tenant test, chạy thử export backup, force sign-out, đổi plan, suspend → unsuspend.

## Files dự kiến
- migration: `supabase/migrations/<ts>_superadmin_extensions.sql`
- create: `src/lib/superadmin-extra.functions.ts`
- create: `src/routes/_app/superadmin/security.tsx`, `backups.tsx`, `jobs.tsx`, `settings.tsx`, `billing.tsx`
- edit: `src/routes/_app/superadmin.tsx` (tabs), `accounts.tsx` (mở rộng), `audit.tsx` (stats + export)
- edit: `src/components/app-sidebar.tsx` nếu cần shortcut Super Admin

## Ngoài scope (ghi nhận, làm sau)
- Restore từ backup (phức tạp, dễ phá dữ liệu).
- 2FA enforcement runtime (cần wire MFA flow).
- IP allowlist runtime middleware.
- Email templates editor.
