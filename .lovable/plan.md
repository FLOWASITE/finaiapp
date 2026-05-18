## Mục tiêu

Nâng cấp trang `/admin/audit` (đã tồn tại ở dạng tối giản) để khai thác đầy đủ dữ liệu audit_logs mới ghi bởi trigger trên 22 bảng nghiệp vụ + profiles, đồng thời thêm component xem lịch sử cho từng bản ghi cụ thể.

## Phạm vi

### 1. Server functions (`src/lib/admin.functions.ts`)
- **Mở rộng `listAuditLogs`**: thêm filter `user_id`, `record_id`, `search` (text trên actor_email), trả thêm `total_count` (head:true) cho phân trang, hỗ trợ `offset`.
- **Thêm `getRecordHistory`**: input `{ table_name, record_id }` → trả mảng audit_logs theo thời gian (cũ→mới) cho 1 bản ghi.
- **Thêm `getAuditFacets`**: trả danh sách distinct `table_name` và `action` trong audit_logs của tenant (để fill combobox filter).

### 2. Trang `/admin/audit` (`src/routes/_app/admin/audit.tsx`)
Tái cấu trúc:
- **Thanh filter**: Combobox `table_name` (từ facets) thay Input thô; Combobox `action` (insert/update/delete); date range; search actor_email; nút Reset.
- **Bảng**: thêm cột "Thay đổi" hiển thị số field thay đổi (so sánh before/after), badge màu theo action, ô record_id click để mở lịch sử bản ghi.
- **Phân trang**: 50 dòng/trang, nút Prev/Next dựa trên offset + total_count.
- **Dialog chi tiết**: thêm tab "Diff" (mặc định) hiển thị bảng key | before | after, chỉ liệt kê field khác nhau, highlight thêm/sửa/xoá. Giữ tab "JSON" cho before/after thô.
- **Xuất CSV**: bổ sung cột `changed_fields` (join `,`).

### 3. Component dùng lại `<RecordAuditHistory />` (`src/components/record-audit-history.tsx`)
- Props: `tableName`, `recordId`.
- Gọi `getRecordHistory`, render timeline gọn (thời gian + actor + action + số field thay đổi + collapsible diff).
- Mục tiêu: nhúng vào các trang chi tiết chứng từ (invoices, sales, cash, bank…) ở loop sau — loop này chỉ tạo component + dùng trong Dialog của trang audit.

### 4. Helper diff (`src/lib/audit-diff.ts`)
- Hàm `diffJsonb(before, after)` trả `Array<{ key, before, after, kind: 'added'|'removed'|'changed' }>`, bỏ qua các field nhiễu: `updated_at`, `created_at`.

## Ngoài phạm vi (loop sau)
- Nhúng `<RecordAuditHistory />` vào các trang nghiệp vụ.
- Bộ lọc theo branch/department/project.
- Realtime stream audit log.

## Kỹ thuật
- Tất cả server fn dùng `requireSupabaseAuth`; RLS hiện tại đã giới hạn theo tenant_id nên không cần filter thủ công.
- Combobox dùng `@/components/ui/select` (shadcn) hoặc Command tuỳ độ dài.
- Diff hiển thị dạng table 3 cột, value dài >120 char thì truncate + tooltip.
