
# Chuẩn hoá cơ cấu tổ chức: Branches / Departments / Projects

Mục tiêu: cho phép một doanh nghiệp (tenant) khai báo nhiều chi nhánh, phòng ban, dự án (tuỳ chọn cả cost center), và gắn các trường này lên chứng từ + bút toán để phục vụ báo cáo theo nhiều chiều.

## 1. Bảng danh mục mới (theo tenant)

Tạo 4 bảng dưới `public`, đều có `tenant_id`, `user_id`, `code`, `name`, `is_active`, `created_at`, `updated_at`, `parent_id` (nếu có cây), và unique `(tenant_id, code)`:

- `branches` — chi nhánh (có địa chỉ, mã thuế phụ, người phụ trách).
- `departments` — phòng ban (có `parent_id` để dựng cây; `branch_id` tuỳ chọn).
- `projects` — dự án/công trình (có `start_date`, `end_date`, `status`, `customer_id` tuỳ chọn, `manager_employee_id` tuỳ chọn).
- `cost_centers` — trung tâm chi phí (tuỳ chọn bật/tắt; có `parent_id`).

RLS: copy đúng mẫu hiện có (`own … all` theo `user_id` + 4 policy `tenant … select/insert/update/delete` theo `tenant_id` + `has_tenant_role`/`is_tenant_member` + `current_tenant_id()`).

Trigger `set_updated_at` cho cả 4 bảng.

## 2. Gắn chiều phân tích lên chứng từ & bút toán

Thêm cột nullable (không phá dữ liệu cũ) + FK ON DELETE SET NULL + index `(tenant_id, …_id)`:

Bảng chứng từ:
- `invoices`, `sales_invoices`, `einvoices`: thêm `branch_id`, `department_id`, `project_id`, `cost_center_id`.
- `cash_vouchers`, `bank_vouchers`, `customer_receipts`, `supplier_payments`: thêm `branch_id`, `project_id`, `cost_center_id` (department thường không cần).
- `fixed_assets`: thêm `branch_id`, `department_id` (tài sản gắn nơi sử dụng).
- `employees`: thêm `branch_id`, `department_id` (thay thế cột `department` text — vẫn giữ cột cũ để migrate dần).
- `payroll_runs`: thêm `branch_id`, `department_id` (lọc bảng lương).

Bảng kế toán:
- `journal_entries`: thêm `branch_id`, `project_id`, `cost_center_id` (mặc định cho cả bút toán).
- `journal_lines`: thêm `branch_id`, `department_id`, `project_id`, `cost_center_id` (cho phép split theo dòng — chuẩn để báo cáo P&L theo dự án/phòng ban).

Bảng phụ trợ:
- `bank_transactions`: thêm `branch_id` (tuỳ ngân hàng của chi nhánh).

Không thay đổi RLS các bảng này (đã có tenant guard); chỉ thêm cột.

## 3. Bảo toàn dữ liệu chéo tenant

Thêm CHECK trigger (không dùng CHECK constraint do cần join):
- Mỗi cột `branch_id/department_id/project_id/cost_center_id` chèn vào chứng từ/journal phải cùng `tenant_id` với row cha. Viết hàm `assert_dim_same_tenant()` + trigger `BEFORE INSERT OR UPDATE` cho từng bảng có các cột này.

## 4. Hồ sơ doanh nghiệp & giá trị mặc định

- Thêm vào `profiles` (hoặc bảng `user_settings` nếu thích): `default_branch_id`, `default_department_id`, `default_project_id` — để các form lập chứng từ tự fill.
- Backfill: với mỗi tenant tạo 1 chi nhánh mặc định "HO" (Head Office) và set `default_branch_id` cho mọi member.

## 5. UI (sẽ làm ở loop sau — không nằm trong migration này)

Sau khi schema được duyệt, các trang cần cập nhật:
- Mới: `/settings/branches`, `/settings/departments`, `/settings/projects`, `/settings/cost-centers` — CRUD danh mục.
- Form chứng từ (sales/purchase invoice, cash/bank voucher, receipt, payment, payroll, fixed asset): thêm 3-4 combobox chọn chi nhánh/phòng ban/dự án/cost center, prefill từ default của user.
- Form journal entry: chọn ở header + cho phép override từng dòng.
- Báo cáo: bộ lọc theo chi nhánh/phòng ban/dự án trên P&L, BS, Sổ cái, Công nợ.

## 6. Thứ tự triển khai đề xuất

1. Migration 1: tạo 4 bảng danh mục + RLS + trigger updated_at.
2. Migration 2: thêm cột + FK + index trên các bảng nghiệp vụ + trigger `assert_dim_same_tenant`.
3. Migration 3: thêm cột default vào `profiles` + seed "HO" cho từng tenant hiện có (qua tool insert).
4. Loop UI: trang CRUD danh mục → tích hợp vào form chứng từ → bổ sung filter báo cáo.

## Chi tiết kỹ thuật

- Tất cả FK đặt `ON DELETE SET NULL` để xoá danh mục không vỡ chứng từ lịch sử.
- Mọi cột mới đều nullable để không phá insert hiện hành.
- Index gợi ý: `(tenant_id, project_id, entry_date)` trên `journal_lines` (qua join `journal_entries`), tương tự `(tenant_id, branch_id, issue_date)` trên `invoices/sales_invoices`.
- Không động vào `chart_of_accounts`, `period_locks`, `audit_logs`, `tenant_members`, `user_roles` trong phương án này.
- Không bật audit trigger ở phương án này (sẽ ở option C nếu chọn sau).

## Câu hỏi cần xác nhận trước khi viết migration

1. Có cần `cost_centers` không, hay chỉ 3 chiều (chi nhánh / phòng ban / dự án)?
2. `departments` có cần thuộc về một `branch` cụ thể, hay dùng chung toàn tenant?
3. Cho phép split chiều phân tích theo từng dòng `journal_lines` (linh hoạt báo cáo) hay chỉ ở header `journal_entries` (đơn giản hơn)?
4. Có cần đặt một trong các chiều này là **bắt buộc** khi ghi sổ (ví dụ: bắt buộc chọn chi nhánh), hay tất cả đều tuỳ chọn?
