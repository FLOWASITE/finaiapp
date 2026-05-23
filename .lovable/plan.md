
# Kế hoạch: Module "Văn phòng" cho công ty dịch vụ kế toán

Mô hình đã chốt: **mỗi khách hàng = 1 tenant FinAI độc lập**. Công ty dịch vụ kế toán hoạt động trong tenant của riêng họ (gọi là **agency tenant**) và quản lý nhiều tenant khách thông qua việc **mời nhân viên làm member đa-tenant**. Module "Office" sống trong agency tenant.

## 1. Cấu trúc dữ liệu (migration mới)

### a. Khách hàng dịch vụ — 2 nguồn
- `office_prospects` (khách chưa onboard FinAI / lead):
  agency_tenant_id, code, name, tax_id, contact_person, phone, email, address, industry, source, status (`new`/`contacted`/`negotiating`/`won`/`lost`), estimated_fee, notes, account_manager_id, converted_tenant_id (nullable — khi đã onboard thì link sang `tenants.id`).
- `office_client_links` (khách đã có tenant FinAI):
  agency_tenant_id, client_tenant_id (FK `tenants.id`), display_name (override), account_manager_id, service_start_date, service_end_date, fee_per_month, status (`active`/`paused`/`terminated`), notes.
  → Unique (agency_tenant_id, client_tenant_id). Dữ liệu định danh khách (tên/MST/địa chỉ) **không lặp** — đọc trực tiếp từ `tenants`.

### b. Hợp đồng dịch vụ
- `office_contracts`: agency_tenant_id, link_id (FK office_client_links), contract_no, sign_date, start_date, end_date, fee_amount, billing_cycle (`monthly`/`quarterly`/`yearly`/`one_off`), services jsonb (checklist: kê khai VAT/PIT/CIT, BHXH, BCTC, sổ sách…), status (`draft`/`active`/`expired`/`terminated`), file_url, notes.
- `office_contract_renewals`: lịch sử gia hạn.

### c. Công việc
- `office_tasks`: agency_tenant_id, link_id (nullable — task nội bộ), contract_id (nullable), title, description, category (`vat_filing`/`pit`/`cit`/`social_insurance`/`bookkeeping`/`financial_report`/`internal`/`other`), priority, status (`todo`/`in_progress`/`review`/`done`/`cancelled`), assignee_user_id, reviewer_user_id, due_date, period_month, period_year, completed_at, recurring_template_id, checklist jsonb, position int (Kanban sort).
- `office_task_templates`: rule định kỳ (`monthly_day`, `quarterly_offset`, `yearly_month_day`, `lead_days`), default_assignee, scope (`all_clients` hoặc danh sách link_id), active.
- `office_task_comments`, `office_task_attachments`.

### d. Nhân sự nội bộ (agency staff)
- `office_staff`: agency_tenant_id, user_id (FK profiles, unique trong tenant), employee_code, full_name, position, department, phone, join_date, leave_date, status, skills text[], avatar_url.
- `office_staff_assignments`: staff_id, link_id, role (`lead`/`assistant`/`reviewer`), from_date, to_date.

### e. Bảng phụ
- Reuse `tenant_members` sẵn có: khi nhân viên agency được giao client → mời họ vào `client_tenant_id` với role `accountant` (1 click từ UI Office). Không tạo bảng membership mới.

### RLS (tất cả bảng office_*)
- SELECT/INSERT/UPDATE/DELETE: `is_tenant_member(auth.uid(), agency_tenant_id)`.
- Sửa template/HR: `has_tenant_role(auth.uid(), agency_tenant_id, ARRAY['owner','admin'])`.
- Task: nhân viên thấy mọi task của agency mình; chỉ assignee/reviewer/owner/admin được đổi status.

## 2. Server functions (`src/lib/office/*.functions.ts`)

Pattern giống `customers.functions.ts` (Zod + `withTenant`):
- `prospects.functions.ts`: CRUD + `convertToClient` (gọi onboard tenant hoặc gắn vào tenant có sẵn).
- `client-links.functions.ts`: list (join `tenants` để lấy name/MST), upsert, archive, `inviteStaffToClientTenant(link_id, staff_user_id, role)` — chèn `tenant_members(client_tenant_id, user_id, role='accountant')`.
- `contracts.functions.ts`: CRUD, `renewContract`, `listExpiring(days)`.
- `tasks.functions.ts`: list (filter link/assignee/status/period/category), upsert, `moveStatus` (Kanban), `bulkAssign`, `completeTask`, `addComment`, `attachFile`.
- `task-templates.functions.ts`: CRUD + `generateForDate(date)` (idempotent theo unique (template_id, link_id, period_year, period_month)).
- `staff.functions.ts`: CRUD danh bạ, assignments.
- `office-dashboard.functions.ts`: KPI (quá hạn, tuần này, hợp đồng sắp hết hạn, tải việc / nhân viên, tỉ lệ on-time).

## 3. Cron sinh task định kỳ
- TSS route: `src/routes/api/public/hooks/office-generate-tasks.ts` (auth bằng `apikey` header).
- pg_cron chạy 02:00 hằng ngày → route lặp mọi agency tenant active → áp dụng từng template → ghi `office_tasks` (skip nếu đã tồn tại).

## 4. UI / Routes

Layout `_app/office` (tabs giống `admin.tsx`):

```text
src/routes/_app/office/
  route.tsx                    -> SidebarLayout + tabs
  index.tsx                    -> dashboard KPI
  clients/
    index.tsx                  -> bảng gộp prospects + client-links (filter status)
    $linkId.tsx                -> chi tiết: info tenant + hợp đồng + tasks + staff phụ trách
                                  + nút "Mời nhân viên vào sổ sách khách"
  prospects/$id.tsx            -> form lead + nút "Chuyển thành khách hàng"
  contracts/index.tsx          -> list + cảnh báo sắp hết hạn
  contracts/$id.tsx            -> chi tiết + gia hạn
  tasks/index.tsx              -> 2 view: List / Kanban (dnd-kit) + filter bar
  tasks/recurring.tsx          -> CRUD templates
  tasks/$taskId.tsx            -> drawer chi tiết
  staff/index.tsx              -> danh bạ (grid card)
  staff/$staffId.tsx           -> hồ sơ + clients phụ trách + tải việc
```

Components mới: `src/components/office/` — `client-table.tsx`, `prospect-form.tsx`, `contract-form-dialog.tsx`, `task-kanban.tsx`, `task-card.tsx`, `task-detail-sheet.tsx`, `recurring-template-form.tsx`, `staff-card.tsx`, `assignment-matrix.tsx`, `office-kpi-cards.tsx`, `invite-to-client-dialog.tsx`.

Sidebar `app-sidebar.tsx`: thêm nhóm **"Văn phòng"** (icon `Briefcase`) chỉ hiển thị khi `office_enabled` true (cờ trên `tenants` — default true cho MVP, có thể tắt sau).

## 5. Tích hợp tenant kép cho nhân viên
- `tenant-switcher` sẵn có đã hỗ trợ đa-tenant; staff agency làm việc trên `client_tenant_id` để ghi sổ kế toán, quay về agency-tenant để xem Office.
- Dialog "Mời nhân viên" gọi `client-links.inviteStaffToClientTenant` → tạo `tenant_members` với role `accountant`.

## 6. Phạm vi MVP (thứ tự build)
1. Migration + RLS (4 nhóm bảng + index).
2. Office layout + sidebar entry.
3. Client Links list + Prospects + convert flow.
4. Staff danh bạ + assignment.
5. Contracts CRUD + cảnh báo hết hạn.
6. Tasks: list + Kanban + filter + detail drawer.
7. Recurring templates + cron route + pg_cron.
8. Dashboard KPI.
9. Dialog mời staff vào tenant khách.

## Ghi chú kỹ thuật
- KHÔNG tạo Edge Function; dùng TanStack server fns + 1 server route `/api/public/hooks/office-generate-tasks`.
- Cài thêm: `@dnd-kit/core`, `@dnd-kit/sortable` (Kanban).
- Period-lock không áp dụng cho dữ liệu Office.
- Mọi mutation invalidate query keys `["office", ...]`.
