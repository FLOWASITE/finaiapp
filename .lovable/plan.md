## Mục tiêu

Hiện trên menu "Phiếu bán hàng" đang trỏ về `/sales` (list hoá đơn), KHÔNG có form phiếu bán hàng theo ảnh tham chiếu. Cần dựng mới module Phiếu bán hàng như mẫu (form + dòng hàng + lưu + ghi sổ), tương đương Phiếu mua hàng.

## 1. Database — migration mới

Tạo 2 bảng mirror của `purchase_vouchers` / `purchase_voucher_lines`:

**`sales_vouchers`** (header)
- Chứng từ: `voucher_no` (auto `BH<YY>-<seq>`), `voucher_date`, `due_date`, `reason` (mặc định "Bán hàng cho khách hàng --- theo hoá đơn số ---"), `currency`, `exchange_rate`, `notes`
- Đối tác: `customer_id`, `customer_name`, `customer_tax_id`, `customer_address`, `customer_group`, `buyer_name` (Người mua hàng), `salesperson_id`, `salesperson_name`
- Định khoản mặc định: `debit_account` (mặc định `131` — công nợ phải thu, có thể override `1311`), `credit_account` (mặc định `5111` — doanh thu), `vat_account` (mặc định `33311`)
- Tổng: `subtotal`, `discount_pct`, `discount_amount`, `vat_amount`, `total`, `paid_amount`, `payment_status` (unpaid/partial/paid)
- Thanh toán: `payment_method` (credit/cash/bank), `payment_account`, `pay_now`
- Phát hành & kho: `issue_einvoice` (Xuất HĐ), `create_stock_voucher` (Xuất kho), `warehouse_id`, `einvoice_id`, `stock_voucher_id`, `cash_voucher_id`, `bank_voucher_id`
- Liên kết: `sales_order_id`, `journal_entry_id`
- Dimensions: `branch_id`, `department_id`, `project_id`, `cost_center_id`
- Trạng thái: `status` (uploaded/reviewed/posted/void), `posted_at`, `voided_at`, `void_reason`
- Audit: `user_id`, `tenant_id`, `created_at`, `updated_at`

**`sales_voucher_lines`** (dòng hàng)
- `voucher_id` FK CASCADE, `line_order`
- Sản phẩm: `product_id` FK products SET NULL, `product_code`, `product_name`, `description`, `unit`
- Số liệu: `qty`, `unit_price`, `amount`, `discount_pct`, `discount_amount`, `vat_rate`, `vat_amount`, `total`
- Định khoản dòng: `debit_account` (TK nợ — 131), `credit_account` (TK có — 511x), `vat_account` (TK thuế GTGT)
- `cost_amount` (giá vốn dự kiến), `line_type` (goods/service)
- `sales_order_line_id` (link sang dòng đơn bán nếu có)

**Bảo mật**
- Enable RLS, policy `tenant_member` cho cả 2 bảng (giống purchase_vouchers).
- Index: `(tenant_id, voucher_date DESC)`, `(tenant_id, status)`, `(tenant_id, customer_id)`, `(voucher_id)` cho lines.
- Trigger `set_updated_at`, `audit_trigger`, `assert_dim_same_tenant`.

## 2. Backend — `src/lib/sales-vouchers.functions.ts`

Mirror nguyên cấu trúc của `src/lib/purchase-vouchers.functions.ts`:
- `listSalesVouchers({status?, from?, to?, q?, page, pageSize})`
- `getSalesVoucher({id})`
- `upsertSalesVoucher({id?, header, lines})` — Zod validate; tự sinh `voucher_no` khi mới (prefix `BH<YY>-`), tính lại `subtotal/vat/total` từ lines, set `tenant_id` từ profile.
- `deleteSalesVoucher({id})` — chỉ cho phép xoá phiếu `uploaded`.
- `postSalesVoucher({id})` — tạo journal_entry với bút toán:
  - Mỗi nhóm `debit_account` (mặc định `131`/`1311`) → Nợ (subtotal − chiết khấu)
  - Mỗi nhóm `credit_account` (mặc định `511x`) → Có (doanh thu)
  - VAT đầu ra → Có `33311` (nhóm theo `vat_account`)
  - Nếu `pay_now` (cash/bank) → thay 131 bằng 1111/1121
  - Áp dụng **fallback TK cha** (như đã sửa cho purchase): nếu code không có trong `chart_of_accounts` thì lùi dần (`33311` → `3331` → `333`).
  - Nếu `create_stock_voucher` + có goods lines → tạo `stock_vouchers` xuất kho, tính giá vốn theo BQGQ và phụ bút toán Nợ 632 / Có 156.
  - Nếu `pay_now` → tạo `cash_vouchers` hoặc `bank_vouchers` thu tiền tương ứng.
  - Update `status='posted'`, gắn `journal_entry_id`, `stock_voucher_id`, `cash_voucher_id`/`bank_voucher_id`.
- Kiểm tra `is_period_locked` trước khi post.

## 3. Route mới — `src/routes/_app/sales/vouchers.tsx`

Mirror `src/routes/_app/purchases/vouchers.tsx` (đã có sẵn skeleton, mobile card, sticky footer…). Layout 2 phần:

**Header form** (grid responsive 2-cols mobile, 4-cols desktop):
- Khách hàng (CustomerCombobox, bắt buộc) + auto-fill tax_id/address/group
- TK công nợ phải thu (`AccountCombobox`, mặc định `1311`)
- Nhóm khách hàng (read-only theo customer)
- Số chứng từ (auto, có nút refresh)
- Hạn thanh toán (DatePicker)
- Địa chỉ (Input)
- Chi nhánh (BranchCombobox)
- Ngày chứng từ (DatePicker, mặc định hôm nay)
- Nhân viên bán hàng (Combobox users của tenant)
- Người mua hàng (Input)
- Ngoại tệ (Select VND/USD/EUR…)
- Mô tả (Textarea bắt buộc)
- Trạng thái thanh toán dropdown ("Chưa thanh toán" / "Đã thanh toán tiền mặt" / "Đã thanh toán CK") + checkbox **Xuất HĐ**, **Xuất kho**
- Tổng (sticky bên phải)

**Lines table** (desktop) / **Cards** (mobile, dùng accordion):
Cột: STT, Tên sản phẩm (ProductPicker), Mã, TK nợ, TK có, Đơn vị, Số lượng, Đơn giá, Giá trị trước thuế, Giảm giá %, Giảm giá, TK thuế GTGT, Thuế GTGT %, Tiền thuế, Thành tiền, xoá.
- Nút **Thêm** + **Thêm nhiều** (dialog multi-pick từ products).
- Chiết khấu tổng (%) + Chiết khấu tổng (amount) ở góc phải.

**Footer sticky**:
- Đính kèm tài liệu (`document-links-manager`)
- Huỷ / Lưu và thoát / dropdown … (Lưu nháp / Ghi sổ / Xoá / In)
- Toolbar list: search, lọc trạng thái, ngày, nút **+ Tạo phiếu** mở dialog form.
- Bảng list có skeleton loading + empty/error state (đã chuẩn cho purchases, áp dụng lại).

## 4. Sidebar

Đổi entry `{ to: "/sales", label: "Phiếu bán hàng" }` → `{ to: "/sales/vouchers", label: "Phiếu bán hàng" }`. Giữ `/sales` cho "Hoá đơn bán" (đổi label thành "Hoá đơn bán" — kế bên).

## 5. Đảm bảo Lưu + Ghi sổ

- **Lưu**: form gọi `upsertSalesVoucher` qua `useMutation`; success → toast + đóng dialog + invalidate `["sales-vouchers"]`. Validate: customer_id, voucher_date, reason, ≥1 line có qty > 0 và unit_price ≥ 0.
- **Ghi sổ**: nút "Ghi sổ" gọi `postSalesVoucher`. Đảm bảo tất cả TK trong jLines được resolve qua `chart_of_accounts` (fallback lùi cha như đã làm bên purchases) để tránh lỗi FK `journal_lines_account_code_fkey`.
- Bao quanh bằng try/catch, hiện toast lỗi rõ ràng tiếng Việt.

## Files thay đổi

```text
+ supabase migration  (sales_vouchers, sales_voucher_lines, RLS, triggers, indexes)
+ src/lib/sales-vouchers.functions.ts
+ src/routes/_app/sales/vouchers.tsx
~ src/components/app-sidebar.tsx     (đổi link /sales → /sales/vouchers, thêm Hoá đơn bán)
```

## Out of scope

- Không sửa hoá đơn bán (`sales_invoices`) hay đơn đặt hàng — chỉ thêm Phiếu bán hàng độc lập, có thể liên kết tới sales_order sau.
- Không build báo cáo doanh thu mới — vẫn dùng `sales_invoices` cho dashboard hiện hữu (Phiếu bán hàng khi Ghi sổ sẽ tạo journal_entries → tự lên báo cáo công nợ/sổ cái).
