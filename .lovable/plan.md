## Mục tiêu

Đưa toàn bộ quản trị tenant của Super Admin về đúng schema `tenants` + `tenant_members` (bỏ phụ thuộc `profiles`-as-tenant), migrate dữ liệu cũ, và bổ sung năng lực còn thiếu: members, transfer ownership, edit metadata tenant, cascade delete data nghiệp vụ theo `tenant_id`.

Hiện trạng: 5 tenants / 5 members / 2 profiles → dữ liệu nhỏ, migrate an toàn.

---

## 1. Migration dữ liệu legacy (chạy 1 lần)

`supabase/migrations/<ts>_backfill_tenants_from_profiles.sql`:

1. Với mỗi `profiles` chưa có `tenants` tương ứng (heuristic: không phải `owner_user_id` của tenant nào):
   - `INSERT INTO tenants` (id mới, copy `company_name`, `tax_id`, `address`, `phone`, `accounting_standard`, `base_currency`, `fiscal_year_start`, `logo_url`, `legal_rep_name`, `chief_accountant_name`, …, `owner_user_id = profiles.id`, `status='active'`, `name = COALESCE(company_name, email)`).
   - `INSERT INTO tenant_members (tenant_id, user_id, role='owner', status='active')`.
   - `UPDATE profiles SET active_tenant_id = <new tenant_id>` nếu đang NULL.
2. Tạo `tenant_plans` mặc định (`plan='free'`) cho mọi tenant chưa có row.
3. Kiểm tra: tất cả `tenants` đều có ≥1 `tenant_members` role `owner`; mọi `profiles` đều có `active_tenant_id`.

## 2. DB function cascade delete

`public.fn_superadmin_delete_tenant_cascade(_tenant_id uuid)` — `SECURITY DEFINER`, `search_path=public`:

- Kiểm tra caller là `superadmin` (`has_role(auth.uid(),'superadmin')`).
- `DELETE FROM <table> WHERE tenant_id = _tenant_id` cho ~110 bảng nghiệp vụ (sinh sẵn từ `information_schema`, không dùng FK CASCADE vì hiện không có).
- Cuối cùng: `DELETE FROM tenant_members`, `tenant_plans`, `tenant_usage`, `tenant_catalog_pins`, `tenant_coa_overrides`, `tenant_product_catalog`, `tenants WHERE id = _tenant_id`.
- KHÔNG xóa `auth.users` (owner có thể còn tenant khác).
- Ghi `audit_logs(action='superadmin.tenant.delete', tenant_id, payload)`.

Thứ tự delete: bảng con (lines, items, history…) → bảng cha (vouchers, invoices…) → ledger (`journal_entries`, `account_period_balances`) → master data (products, customers, suppliers, employees, branches…) → AI/inbox → tenant_* → `tenants`. Sinh script bằng query `information_schema.columns` để không sót bảng mới.

## 3. Server functions mới

File mới `src/lib/superadmin-tenants.functions.ts` (tách khỏi `superadmin.functions.ts`):

| Fn | Mô tả |
|---|---|
| `listTenantsAdmin(filters)` | Query `tenants` + LEFT JOIN owner email (qua `auth.admin.getUserById` batch hoặc `profiles`), members count, `tenant_plans.plan`, last activity từ `audit_logs.created_at` max. Hỗ trợ filter status/plan/accounting_standard/idle/q, paginate. |
| `getTenantAdmin(tenantId)` | Tenant full row + members (join email/display_name) + plan + usage period hiện tại + 50 audit gần nhất + fiscal_periods closed. |
| `updateTenantAdmin(tenantId, patch)` | Update whitelisted fields (name, company_name, tax_id, address, phone, accounting_standard, base_currency, fiscal_year_start, legal_rep_name, chief_accountant_name, logo_url, industry_*, tax_method, vat_period, …). |
| `addTenantMember({tenantId,email,role})` | Tìm user theo email qua admin API; nếu chưa có → invite; insert `tenant_members`. |
| `removeTenantMember(memberId)` | Chặn xóa owner cuối cùng. |
| `updateMemberRole(memberId, role)` | Chặn hạ cấp owner nếu là owner duy nhất. |
| `transferTenantOwnership(tenantId, newOwnerUserId)` | Transaction: update `tenants.owner_user_id`, set role mới = `owner`, role cũ = `admin`. |
| `deleteTenantAdmin(tenantId, confirmName)` | So khớp `confirmName` với `tenants.name`; gọi `fn_superadmin_delete_tenant_cascade`. |

Mọi fn: `assertSuperadmin`, ghi `audit_logs` với `action='superadmin.tenant.*'`.

## 4. UI refactor

### `/superadmin/organizations` (viết lại)

- Bỏ `listOrganizationsWithStats / updateOrganization / deleteOrganization` (profiles-based) → dùng `listTenantsAdmin`.
- Cột: name, company_name, MST, owner email, accounting_standard, status badge (active/suspended), plan, members count, last activity, created_at.
- Filter: status, plan, accounting_standard, idle >90d, free-text.
- Row actions: View detail, Suspend/Restore (dùng `setTenantSuspended` đã có), Change plan nhanh.
- Bulk: suspend nhiều, export CSV.
- 4 stats card: total / active / suspended / idle.

### `/superadmin/tenant/$id` (viết lại — `id` = tenant_id thật)

6 tabs:

1. **Tổng quan** — form edit metadata (`updateTenantAdmin`), owner card, status badge + suspend reason.
2. **Thành viên** — bảng `tenant_members` + add/remove/change role/transfer ownership.
3. **Plan & Usage** — plan hiện tại + quota + `tenant_usage` period hiện tại + edit plan (`updateTenantPlan`).
4. **Khóa kỳ kế toán** — `fiscal_periods` closed, link đến `fiscal_period_unseal_requests`.
5. **Audit log** — paginate `audit_logs WHERE tenant_id`.
6. **Vùng nguy hiểm** — Suspend/Restore (kèm reason), Delete vĩnh viễn (yêu cầu gõ đúng `tenants.name` + checkbox xác nhận).

### `/superadmin` (index)

Sửa `listAllTenants` → dùng `listTenantsAdmin` để đồng bộ. Giữ chức năng cấp/thu hồi superadmin.

### Cleanup

- Xóa/đánh dấu deprecated: `listOrganizationsWithStats`, `updateOrganization`, `deleteOrganization`, `getTenantDetail` (phiên bản dựa profile) trong `superadmin.functions.ts`.
- Trang `/superadmin/billing` giữ nguyên (đã đúng schema).

## 5. Bảo mật

- Tất cả fn mới gate bằng `assertSuperadmin`.
- `fn_superadmin_delete_tenant_cascade` là `SECURITY DEFINER` + re-check `has_role`.
- Delete cần xác nhận tên tenant ở cả client (disable nút) và server (so khớp lại).
- Không expose email user ngoài bảng list (chỉ owner email + members khi mở chi tiết).
- Audit log mọi mutation.

## 6. Thứ tự thực thi

1. Tạo migration backfill + `fn_superadmin_delete_tenant_cascade` → user duyệt.
2. Viết `src/lib/superadmin-tenants.functions.ts`.
3. Viết lại `/superadmin/organizations` + `/superadmin/tenant/$id` (+ components: `members-tab.tsx`, `plan-usage-tab.tsx`, `danger-zone-card.tsx`, `transfer-owner-dialog.tsx`).
4. Sửa `/superadmin/index.tsx` dùng API mới.
5. Deprecate fn cũ trong `superadmin.functions.ts`.
6. Smoke test: list, suspend, edit metadata, add/remove member, transfer ownership, delete trên 1 tenant test.

## 7. Out of scope

- Không tạo bảng mới ngoài backfill.
- Không đụng `auth.users` (xóa user là việc của trang Accounts).
- Không thay đổi RLS của các bảng nghiệp vụ.
