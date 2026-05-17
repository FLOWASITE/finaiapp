
## Mục tiêu

Bạn chọn 2 hướng phát triển cho Super Admin → Tổ chức:
1. **Thống kê & sức khỏe tổ chức** — bổ sung KPI trên từng dòng (số hóa đơn, doanh thu, số thành viên, lần hoạt động gần nhất…).
2. **Một tài khoản nhiều tổ chức** — mỗi user có thể tạo/tham gia nhiều org và chuyển qua lại.

(2) là thay đổi lớn về kiến trúc dữ liệu (hiện tại "tổ chức = chính user owner", `profiles.id = auth user id`, `*.user_id` mọi nơi). Tôi đề nghị làm theo 2 giai đoạn để không phá dữ liệu hiện có.

---

## Giai đoạn 1 — Thống kê & sức khỏe (làm ngay, ít rủi ro)

### Backend
Thêm server function mới `listOrganizationsWithStats` trong `src/lib/superadmin.functions.ts`:
- Trả về danh sách orgs (như cũ) + cho mỗi org các số liệu, tính bằng query `supabaseAdmin` gộp theo `user_id`:
  - `invoice_count` (bảng `invoices`)
  - `sales_total` 12 tháng gần nhất (SUM `sales_invoices.total`)
  - `members_count` (đếm rows `user_roles` thuộc owner đó — sẽ có nghĩa khi GĐ2 chạy; tạm bằng 1)
  - `last_activity_at` = MAX(`updated_at`) qua `invoices`, `sales_invoices`, `journal_entries`, `audit_logs`
  - `storage_invoices_bytes` (sum object size từ bucket `invoices` theo prefix `user_id/`)
- Hiệu năng: 1 query cho mỗi chỉ số dùng `IN (user_id…)` rồi group, không N+1.

### UI (`src/routes/_app/superadmin/organizations.tsx`)
- Thêm cột: **Số hóa đơn**, **Doanh thu 12T**, **Hoạt động gần nhất**, **Thành viên** (badge), **Trạng thái** (active / idle >90 ngày / new <7 ngày).
- Thêm bộ lọc nhanh: `Tất cả / Đang hoạt động / Không hoạt động (>90 ngày) / Mới tạo (<7 ngày)`.
- Sort theo từng cột (click header).
- Thẻ tóm tắt phía trên: tổng số tổ chức, tổng hóa đơn, tổng doanh thu, số org idle.
- Giữ nguyên Tìm kiếm, Sửa, Xóa hiện có.

---

## Giai đoạn 2 — Một tài khoản nhiều tổ chức (ask trước khi code)

Đây là refactor lớn, tôi muốn xác nhận hướng trước khi viết migration.

### Mô hình đề xuất
```text
tenants (id, name, owner_user_id, accounting_standard, base_currency, fiscal_year_start, tax_id, address, phone, logo_url, …)  ← tách khỏi profiles
tenant_members (tenant_id, user_id, role: owner|accountant|viewer, created_at)
profiles (id, email, display_name, active_tenant_id)  ← chỉ còn thông tin user cá nhân
```
- Mọi bảng dữ liệu hiện có (`invoices`, `sales_invoices`, `journal_entries`, `employees`, `products`, `bank_*`, `cash_vouchers`, `payroll_*`, `fixed_assets`, `audit_logs`, …) thêm `tenant_id uuid not null`.
- RLS đổi từ `auth.uid() = user_id` → `is_tenant_member(auth.uid(), tenant_id)` (security definer).

### Migration data hiện có
- Tạo `tenants` row cho mỗi `profiles` hiện hữu (`tenant_id = profiles.id`, `owner_user_id = profiles.id`, copy các trường công ty).
- Tạo `tenant_members` (user_id = owner, role = owner).
- Cho mọi bảng: `ALTER TABLE … ADD COLUMN tenant_id uuid; UPDATE … SET tenant_id = user_id; ALTER … SET NOT NULL`.
- Drop policy cũ, tạo policy mới theo `tenant_id`.
- Đổi mọi server function/UI từ `user_id` filter → `tenant_id` filter (lấy từ `profiles.active_tenant_id`).

### UI bổ sung
- Switcher tổ chức ở header (`<TenantSwitcher />`) — dropdown các tenant user là thành viên + nút "Tạo tổ chức mới" + "Chấp nhận lời mời".
- Trang `/settings/members`: chủ tổ chức mời người khác (đã có sẵn `user_invitations`, chỉ cần gắn `tenant_id`).
- Super Admin → Tổ chức: cột "Owner" + "Số thành viên" thực sự có ý nghĩa.

### Rủi ro / lưu ý
- Refactor cỡ trung-lớn: chạm ~20 file route + ~10 server-fn. Cần thử kỹ với 1 dataset thật.
- Audit log: cần thêm `tenant_id` để Super Admin lọc theo org đúng.

---

## Đề xuất thực thi

Tôi sẽ **làm GĐ1 ngay** (xong sớm, có giá trị ngay) và **chờ bạn xác nhận GĐ2** trước khi tạo migration để tránh phá vỡ dữ liệu hiện có.

Sau khi GĐ1 xong, nếu bạn đồng ý mô hình `tenants + tenant_members + active_tenant_id` ở trên, tôi sẽ:
1. Tạo migration (bạn duyệt).
2. Refactor server functions.
3. Thêm TenantSwitcher + trang quản lý thành viên.
4. Cập nhật trang Super Admin với dữ liệu thành viên thật.

Bấm "Implement plan" để bắt đầu GĐ1, hoặc trả lời nếu muốn đổi thứ tự / phạm vi.
