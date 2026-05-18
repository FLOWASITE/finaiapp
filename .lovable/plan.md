## Mục tiêu
Bật audit log thật sự cho mọi bảng nghiệp vụ quan trọng — mọi INSERT/UPDATE/DELETE đều được ghi vào `public.audit_logs` kèm `tenant_id`, `user_id`, `actor_email`, `before`/`after` JSON.

## Hiện trạng
- Hàm `public.audit_trigger()` đã tồn tại nhưng **chưa ghi `tenant_id`** vào `audit_logs`.
- Trigger đã gắn cho: `invoices`, `sales_invoices`, `journal_entries`, `payroll_runs`, `period_locks`, `user_roles`.
- Còn thiếu trên rất nhiều bảng nghiệp vụ cốt lõi.

## Phạm vi migration (C)

### 1. Nâng cấp `audit_trigger()`
- Trích `tenant_id` từ `NEW`/`OLD` (qua `to_jsonb`) khi có cột này → ghi vào `audit_logs.tenant_id`.
- Với `journal_lines` (không có `tenant_id` trực tiếp): lấy `tenant_id` từ `journal_entries` theo `entry_id`.
- Bỏ qua an toàn khi không có `id` UUID (giữ logic `EXCEPTION WHEN others`).

### 2. Gắn trigger `AFTER INSERT OR UPDATE OR DELETE` (FOR EACH ROW) cho các bảng:

**Chứng từ & nghiệp vụ**
- `einvoices`
- `cash_vouchers`, `bank_vouchers`
- `customer_receipts`, `supplier_payments`
- `bank_transactions`
- `fixed_assets`

**Sổ kế toán**
- `journal_lines`

**Danh mục & tổ chức**
- `accounts` (chart of accounts)
- `customers`, `suppliers`
- `employees`
- `bank_accounts`
- `branches`, `departments`, `projects`, `cost_centers`
- `tax_periods`

**Quản trị tenant & quyền**
- `tenants`, `tenant_members`
- `profiles` (chỉ UPDATE/DELETE, vì INSERT do trigger handle_new_user)

**Tài liệu**
- `documents`, `document_links`

### 3. Tên trigger: `audit_<table>` — `DROP TRIGGER IF EXISTS` trước khi tạo (idempotent).

### 4. KHÔNG gắn audit_trigger lên:
- `audit_logs` (vô hạn đệ quy)
- `document_status_history` (đã là log)
- Bảng cache/đọc-nhiều như `einvoice_jobs`, `ocr_jobs` nếu có (sẽ ngốn dung lượng)

### 5. Index bổ sung
- `idx_audit_logs_record` trên `(table_name, record_id, created_at DESC)` để xem lịch sử 1 bản ghi nhanh.
- `idx_audit_logs_tenant_table_created` trên `(tenant_id, table_name, created_at DESC)`.

## Lưu ý
- Audit triggers chạy `SECURITY DEFINER` nên không bị RLS chặn ghi.
- Sẽ tăng dung lượng DB; sau này có thể thêm job cắt log > N tháng (ngoài phạm vi C).
- KHÔNG có UI mới ở bước này — chỉ DB. UI xem lịch sử (`/audit-logs`, hoặc drawer trên từng chứng từ) sẽ là bước D nếu bạn muốn.

## Câu hỏi xác nhận
1. Có muốn audit cả các bảng "tham chiếu nhanh" như `bank_transactions` (có thể nhiều dòng/ngày) không, hay loại trừ để tiết kiệm dung lượng?
2. Có bảng nào bạn KHÔNG muốn audit (vì lý do riêng tư hoặc khối lượng) không?
3. Sau khi xong (C), có muốn mình làm tiếp UI xem lịch sử kiểm toán (D) ngay không?
