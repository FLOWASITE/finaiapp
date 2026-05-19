## Mục tiêu

Thêm migration bổ sung **tất cả các foreign key còn thiếu** mà script `check-fk-relationships.ts` vừa phát hiện (25 cảnh báo), để PostgREST nhận diện đúng quan hệ và không tái diễn lỗi schema cache như `projects ↔ customers`.

## Danh sách FK sẽ thêm

Mỗi FK dùng `ON DELETE SET NULL` cho cột tham chiếu tùy chọn (dimensions, journal_entry_id, salesperson…) và `ON DELETE CASCADE` cho line/child tables thực sự thuộc về parent.

**SET NULL** (tham chiếu tùy chọn, không nên xoá lan):
- `sales_invoices.journal_entry_id → journal_entries.id`
- `sales_invoices.sales_order_id → sales_orders.id`
- `sales_order_deposits.branch_id → branches.id`
- `sales_order_deposits.cost_center_id → cost_centers.id`
- `sales_order_deposits.department_id → departments.id`
- `sales_order_deposits.project_id → projects.id`
- `sales_orders.salesperson_id → employees.id`
- `stock_takes.journal_entry_id → journal_entries.id`
- `stock_vouchers.journal_entry_id → journal_entries.id`
- `supplier_payments.journal_entry_id → journal_entries.id`

**CASCADE / RESTRICT** (quan hệ chính, master phải tồn tại):
- `product_unit_conversions.product_id → products.id` (CASCADE)
- `supplier_payments.invoice_id → invoices.id` (CASCADE — payment thuộc invoice)
- `supplier_payments.supplier_id → suppliers.id` (RESTRICT)

## Các bước

1. **Kiểm tra dữ liệu mồ côi trước** (read_query) cho từng cặp — nếu có hàng `customer_id`/`supplier_id`/v.v. trỏ tới id không tồn tại, báo lại để user quyết (xoá / set null / sửa). Migration sẽ fail nếu còn mồ côi.
2. **Tạo 1 migration** chứa toàn bộ `ALTER TABLE ... ADD CONSTRAINT ... FOREIGN KEY ...` ở trên, đặt sau khi đã làm sạch dữ liệu mồ côi (nếu có).
3. Sau migration, `types.ts` sẽ được Supabase tự cập nhật; PostgREST tự reload schema cache.

## Tự động hoá (chống tái diễn)

Thêm **script npm** `check:fk` trong `package.json`:

```json
"scripts": {
  "check:fk": "bun run scripts/check-fk-relationships.ts"
}
```

Bổ sung mục hướng dẫn ngắn ở đầu `scripts/check-fk-relationships.ts`: chạy script này **sau mỗi lần migration thêm bảng/cột `*_id` mới**; nếu cảnh báo, tạo migration FK ngay.

> Không cài git hook tự động (sẽ làm chậm commit và cần quyền DB). Việc chạy bằng tay + nhắc trong docs là đủ ở giai đoạn này — có thể nâng cấp lên CI sau.

## Không nằm trong phạm vi

- Không sửa các cảnh báo giả (cột `*_id` không thật sự là FK, nếu có) — script đã có `IGNORE_COLUMNS` và override, có thể tinh chỉnh sau khi user xác nhận.
- Không đụng tới `tenant_id`, `user_id`, `created_by`… (đã loại trừ).

## Bước tiếp theo cần user xác nhận

Trước khi tôi viết migration, user xác nhận:
- (a) Danh sách FK + chính sách ON DELETE ở trên có phù hợp?
- (b) Có muốn tôi kiểm tra dữ liệu mồ côi trước và báo cáo không?
