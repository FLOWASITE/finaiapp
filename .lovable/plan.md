## Mục tiêu
Bổ sung **chức năng sinh mã/số chứng từ tự động** thống nhất cho 7 đối tượng còn thiếu, đồng bộ với pattern đã có ở Phiếu thu/Phiếu chi (`nextVoucherNo`).

## Hiện trạng

| Đối tượng | Bảng | Cột | Trạng thái |
|---|---|---|---|
| Phiếu thu | `cash_vouchers` | `voucher_no` | ✅ Đã có `nextVoucherNo` (`PT{yyyymm}/00001`) — chỉ cần wire vào UI |
| Phiếu chi | `cash_vouchers` | `voucher_no` | ✅ Đã có (`PC{yyyymm}/00001`) — chỉ cần wire vào UI |
| Bán hàng | `sales_invoices` | `invoice_no` | ❌ Nhập tay |
| Mua hàng | `invoices` | `invoice_no` | ❌ Nhập tay |
| Khách hàng | `customers` | `code` | ❌ Nhập tay |
| Nhà cung cấp | `suppliers` | `code` | ❌ Nhập tay |
| Hàng hoá/Dịch vụ | `products` | `code` | ⚠️ Có nút ⟳ client-side ở `/items` (chỉ thấy data đã load) — sẽ chuyển lên server để đếm chính xác |

## Quy ước mã (theo chuẩn Misa/Fast)

| Đối tượng | Pattern | Ví dụ |
|---|---|---|
| Phiếu thu | `PT{yyyymm}/{5d}` | `PT202605/00001` *(đã có)* |
| Phiếu chi | `PC{yyyymm}/{5d}` | `PC202605/00001` *(đã có)* |
| Bán hàng | `HD{yyyymm}/{5d}` | `HD202605/00001` |
| Mua hàng | `HDM{yyyymm}/{5d}` | `HDM202605/00001` |
| Khách hàng | `KH{5d}` | `KH00001` (không theo tháng — danh mục) |
| Nhà cung cấp | `NCC{5d}` | `NCC00001` |
| Hàng hoá | `HH{4d}` | `HH0001` *(giữ format đã có)* |
| Dịch vụ | `DV{4d}` | `DV0001` |
| Combo | `CB{4d}` | `CB0001` |

## Thiết kế

### 1. Server: helper tập trung `src/lib/codegen.functions.ts`

Một server function duy nhất `nextEntityCode({ entity, date? })`:

```ts
entity: "sale_invoice" | "purchase_invoice" | "customer" 
      | "supplier" | "product_goods" | "product_service" | "product_combo"
```

- Lookup `{ table, column, prefix, dateScoped, padLen }` theo entity.
- `dateScoped=true` → pattern `${prefix}${yyyymm}/%`, parse `/(\d+)$`.
- `dateScoped=false` → pattern `${prefix}%`, parse `(\d+)$`.
- Quét tất cả mã matching cho **tenant hiện tại** (qua `requireSupabaseAuth` + `active_tenant_id`), lấy `max + 1`.
- Trả về `{ code: string }`.
- Race-safe: phía UI vẫn validate trùng + DB có UNIQUE constraint sẽ throw 23505 → user bấm lại nút sinh.

Phiếu thu/chi giữ nguyên `nextVoucherNo` (đã hoạt động) để tránh đụng code đã chạy.

### 2. UI: component dùng chung `<AutoCodeInput>`

`src/components/ui/auto-code-input.tsx`:
- Wrapper `Input` + nút icon `RefreshCw` bên phải (tooltip "Tự sinh mã").
- Props: `value`, `onChange`, `entity`, `date?`, `placeholder`, `error?`.
- Khi bấm nút → gọi `nextEntityCode` → setValue, toast nhẹ.
- Khi dialog mới mở mà field rỗng → tự động fill 1 lần (tuỳ chọn `autoFillOnMount`).

### 3. Wire vào từng dialog

| Trang | Dialog | Thay thế field `code/invoice_no/voucher_no` |
|---|---|---|
| `/items` (`items/index.tsx`) | ProductDialog | Đã có nút ⟳ — đổi sang gọi `nextEntityCode` cho chính xác |
| `/customers/index.tsx` | Customer form | Thêm `<AutoCodeInput entity="customer">` |
| `/suppliers/index.tsx` | Supplier form | Thêm `<AutoCodeInput entity="supplier">` |
| `/sales/index.tsx` | Sales invoice form (tab "Hoá đơn") | `<AutoCodeInput entity="sale_invoice" date={issue_date}>` |
| `/purchases/index.tsx` | Purchase invoice form | `<AutoCodeInput entity="purchase_invoice" date={issue_date}>` |
| `/cash` (PT/PC) | Voucher dialog | Wire vào `nextVoucherNo` qua cùng component (có flag dùng API khác) — hoặc giữ logic riêng nếu UI đã có |

### 4. Hành vi
- **Auto-fill khi mở dialog tạo mới** (field rỗng → gọi API 1 lần).
- **Không auto-fill khi sửa** (đã có mã).
- **Cho phép user sửa tay** sau khi sinh.
- **Validate trùng client-side** (đã có ở `items` — mở rộng cho khách/NCC bằng cách load danh sách hiện có).

## Phạm vi file

**Tạo mới:**
- `src/lib/codegen.functions.ts` — `nextEntityCode` + middleware register trong `start.ts` (nếu cần)
- `src/components/ui/auto-code-input.tsx` — UI component dùng chung

**Sửa:**
- `src/routes/_app/items/index.tsx` — đổi `genCode` client → gọi `nextEntityCode`
- `src/routes/_app/customers/index.tsx` — thêm AutoCodeInput
- `src/routes/_app/suppliers/index.tsx` — thêm AutoCodeInput
- `src/routes/_app/sales/index.tsx` — thêm AutoCodeInput vào form hoá đơn
- `src/routes/_app/purchases/index.tsx` — thêm AutoCodeInput vào form hoá đơn
- `src/routes/_app/cash/*.tsx` — wire `nextVoucherNo` (nếu chưa)

**Không đổi:**
- Schema DB (không cần migration — các cột mã đã tồn tại)
- `cash.functions.ts` (giữ `nextVoucherNo`)
- Backend logic của sales/purchases/customers/suppliers (chỉ FE thay đổi)

## Out of scope
- Trang Cài đặt cho phép tenant tuỳ biến prefix (đề xuất task riêng — sẽ cần bảng `code_sequences`).
- Reset số thứ tự theo năm (hiện tại theo tháng cho voucher, theo all-time cho danh mục).
- Lock số chứng từ kế toán đã ghi sổ.
