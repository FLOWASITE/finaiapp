# Phân hệ Quản lý dữ liệu kế toán theo năm tài chính

Tất cả thao tác **gắn với 1 năm tài chính** (chọn năm ở đầu trang). Dữ liệu xuất ra theo **định dạng Fin** (JSON có schema/phiên bản riêng) và có thể import ngược lại.

Đặt tại `/admin/data`, quyền **owner + accountant**.

## Tab 1 — Xuất dữ liệu (Fin Export)

- **Chọn năm tài chính** + tuỳ chọn nội dung (mặc định bật hết):
  - Bút toán & sổ cái (`journal_entries`, `journal_lines`)
  - Hóa đơn mua/bán + dòng (`invoices`, `invoice_lines`, `sales_invoices`, `sales_invoice_lines`)
  - Thu/chi (`cash_vouchers`, `customer_receipts`, `supplier_payments`)
  - Ngân hàng (`bank_transactions`)
  - Lương (`payroll_runs`, `payroll_lines`)
  - TSCĐ + khấu hao (`fixed_assets`, `depreciation_entries`)
  - Số dư tài khoản (`account_period_balances` của năm đó)
  - **Danh mục đi kèm** (không scope theo năm): khách, NCC, hàng hoá, COA, đơn vị, kho, 4 chiều phân tích → tuỳ chọn "Kèm danh mục"
- **Định dạng Fin** (`.fin.json`, có thể nén `.fin.json.gz`):
  ```json
  {
    "format": "fin-export",
    "version": 1,
    "tenant": { "id", "company_name", "tax_id" },
    "fiscal_year": 2025,
    "exported_at": "...",
    "exported_by": "...",
    "tables": { "journal_entries": [...], "journal_lines": [...], ... },
    "row_counts": { ... }
  }
  ```
- Lưu vào Storage bucket `tenant-exports` (private, RLS theo tenant) + ghi `system_backups` (mở rộng cột `fiscal_year`).
- Lịch sử export: năm, người, dung lượng, nút Tải / Xoá.

## Tab 2 — Nhập dữ liệu (Fin Import)

- Upload file `.fin.json(.gz)` → đọc header, hiển thị **preview**: năm tài chính trong file, tenant gốc, số dòng từng bảng.
- **Chế độ nhập**:
  - `merge` (mặc định): upsert theo natural key (entry no, invoice no…) — bỏ qua trùng.
  - `replace_year`: xoá sạch dữ liệu năm đích trước khi nhập (yêu cầu owner xác nhận + năm chưa khoá cứng).
- Validate trước khi commit:
  - Schema version khớp.
  - Năm tài chính = năm đang chọn (cảnh báo nếu lệch, cho phép override).
  - Tài khoản, KH/NCC trong dữ liệu phải tồn tại; nếu không → liệt kê thiếu, đề xuất "Tạo mới tự động".
  - Chặn nếu bất kỳ tháng nào trong năm đang `closed` (khoá cứng) và chế độ là `replace_year`.
- Ghi `import_batches` (kind=`fin_import`), lưu `decisions.created_ids` để có thể rollback toàn bộ batch.
- Sau import: gọi `rebuild_account_period_balances(tenant)` để đồng bộ số dư.

## Tab 3 — Kết chuyển số dư sang năm sau

- Chọn năm nguồn → năm đích.
- Server fn `carryForwardBalances`:
  - Lấy luỹ kế cuối năm nguồn từ `account_period_balances` (sum period 1–12) cho tài khoản lớp **1–4**.
  - Upsert vào năm đích `period_no=0` (số dư đầu kỳ). Idempotent.
  - Tài khoản lớp 5–9 không kết chuyển (đã về 0 sau bút toán 911).
- Preview bảng dư trước khi commit. Log `audit_logs`.
- Cảnh báo nếu năm nguồn chưa khoá đủ 12 kỳ (cho override).

## Tab 4 — Lịch sử

Gộp lịch sử Export + Import + Carry-forward (đọc từ `system_backups`, `import_batches`, `audit_logs` filter action `carry_forward_balances`). Lọc theo năm.

## Cấu trúc file

```
src/lib/data-management.functions.ts    # exportFin, importFinPreview, importFinCommit,
                                        # carryForwardBalances, listDataHistory
src/lib/fin-format.ts                   # types FinExport v1, parse/validate helpers
src/routes/_app/admin/data.tsx          # layout 4 tab + selector năm
src/routes/_app/admin/data/export.tsx
src/routes/_app/admin/data/import.tsx
src/routes/_app/admin/data/carry-forward.tsx
src/routes/_app/admin/data/history.tsx
supabase/migrations/<ts>_data_mgmt.sql
```

## Migration

- Bucket `tenant-exports` private + RLS theo tenant prefix (`{tenant_id}/...`).
- Thêm cột `fiscal_year int` và `kind` mở rộng (`fin_export`, `fin_import_snapshot`) vào `system_backups`.
- RLS `system_backups`: thêm policy cho thành viên tenant (owner/accountant) thấy backup của tenant mình.
- Hàm `carry_forward_balances(p_tenant uuid, p_from int, p_to int)` plpgsql security definer, dùng lại logic `apply_balance_delta`.
- Hàm `delete_year_data(p_tenant, p_year)` security definer (chỉ owner) — phục vụ `replace_year`.

## Sidebar

Thêm **"Quản lý dữ liệu"** (icon Database) trong nhóm Quản trị. Trang `/admin/backup` cũ → redirect sang `/admin/data/export`.

## Loại trừ (làm sau)

- Restore toàn tenant (drop & rebuild) — chưa làm.
- Khôi phục từ snapshot `/superadmin/backups`.
- Import từ định dạng MISA/Fast/Bravo.
- Xuất Excel (chỉ Fin JSON ở loop này).
