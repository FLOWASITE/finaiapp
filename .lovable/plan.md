## Mục tiêu

Tạo script kiểm tra các quan hệ foreign key trong database PostgreSQL (Supabase) và cảnh báo khi phát hiện cột có vẻ là khóa ngoại (theo quy ước đặt tên) nhưng **thiếu** constraint FK thực sự — tránh lặp lại lỗi như `projects.customer_id` không có FK tới `customers.id` khiến PostgREST không nhận diện được quan hệ.

## Phạm vi

- Script Node.js/TS chạy độc lập (`scripts/check-fk-relationships.ts`), gọi bằng `bun run scripts/check-fk-relationships.ts`.
- Kết nối qua biến môi trường `SUPABASE_DB_URL` (đã có sẵn trong secrets).
- Chỉ kiểm tra schema `public`.
- Báo cáo ra console với màu (✓ pass, ⚠ warning, ✗ error) và exit code khác 0 nếu có cảnh báo (để dùng được trong CI sau này).

## Logic kiểm tra

1. **Liệt kê FK hiện có** từ `information_schema.table_constraints` + `key_column_usage` + `constraint_column_usage`.
2. **Quét các cột nghi là FK** trong tất cả bảng `public.*`:
   - Cột kết thúc bằng `_id` (trừ `id`, `user_id` — vì user_id thường tham chiếu `auth.users` và không cần FK cứng theo guideline Supabase).
   - Heuristic suy ra bảng đích:
     - `customer_id` → `customers`
     - `project_id` → `projects`
     - `<name>_id` → `<name>s` hoặc `<name>` (thử cả 2 dạng số nhiều/số ít).
3. **So sánh**: nếu cột nghi FK không có constraint tương ứng VÀ bảng đích tồn tại trong `public` → cảnh báo.
4. **Bổ sung** cảnh báo cho các trường hợp đặc biệt đã biết (whitelist nội bộ trong script):
   - Bỏ qua `tenant_id`, `user_id`, `created_by`, `updated_by`, `changed_by` (tham chiếu `auth.users` hoặc `tenants` tùy convention).
   - Cho phép cấu hình `IGNORE` set ở đầu file.

## Output mẫu

```
Đang kiểm tra FK trong schema public...

✓ sales_invoices.customer_id → customers.id
✓ sales_orders.salesperson_id → employees.id
⚠ THIẾU FK: some_table.warehouse_id (nghi tham chiếu warehouses.id)
⚠ THIẾU FK: foo.bar_id (nghi tham chiếu bars.id)

Tổng: 142 FK hợp lệ, 2 cảnh báo
```

## Cấu trúc file

```text
scripts/
  check-fk-relationships.ts    # script chính
```

Không thêm dependency mới (dùng `pg` đã có sẵn nếu có, hoặc `postgres` — sẽ kiểm tra `package.json`; nếu chưa có sẽ dùng `bun add postgres`).

## Cách chạy

```bash
bun run scripts/check-fk-relationships.ts
```

Có thể thêm vào `package.json` script `"check:fk": "bun run scripts/check-fk-relationships.ts"` nếu user muốn.

## Không nằm trong phạm vi

- Không tự động tạo migration sửa FK (chỉ cảnh báo, để tránh thay đổi schema ngoài ý muốn).
- Không tích hợp vào CI/pre-commit (có thể làm sau).
