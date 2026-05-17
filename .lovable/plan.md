## Mục tiêu
Gộp Phân hệ Mua hàng (hiện 3 route rời `/invoices`, `/suppliers`, `/payables`) thành **một hub `/purchases`** kiểu Xero — đối xứng với hub Bán hàng `/sales` đã làm. Đối ứng kế toán: TK 331 (phải trả NCC), 111/112 (chi tiền), 133 (VAT đầu vào).

## Cấu trúc đề xuất

### Route mới
- `/purchases` — Purchases Overview hub (mới)
- `/purchases/$id` — Chi tiết hoá đơn mua (chuyển từ `/invoices/$id`)
- `/suppliers`, `/suppliers/$id` — **giữ nguyên** (master data, độc lập)

### Redirects (giữ deep-link cũ)
- `/invoices` → `/purchases?tab=invoices` (giữ query nếu có)
- `/invoices/$id` → `/purchases/$id`
- `/payables` → `/purchases?tab=payables`

## Layout hub `/purchases` (mirror `/sales`)

```text
┌─ Header: "Mua hàng" + actions [+ Phiếu chi] [+ HĐ thủ công] [⇪ Upload HĐ]
├─ Money strip (2×2 mobile / 4 cột desktop, click-to-filter):
│  • Chi phí mua tháng        → tab invoices
│  • Đã trả tháng             → tab payments
│  • Phải trả (tổng dư 331)   → tab invoices status=unpaid
│  • Quá hạn                  → tab overdue
├─ Mini KPI (3 cột): Đã trả 30/60/90 ngày
├─ Charts (lg:3 cột):
│  • Chi phí vs Đã trả 6 tháng (ComposedChart) — col-span-2
│  • Aging phải trả (Pie 0-30/31-60/61-90/>90)
└─ Tabs:
   • Hoá đơn mua (table từ /invoices)
   • Phiếu chi   (table supplier_payments — mới)
   • Quá hạn     (overdue list)
   • Top NCC nợ  (top creditors)
```

URL state: `?tab=invoices|payments|overdue|suppliers&status=…&invoice=…&supplier=…` — dùng `validateSearch` y hệt `SalesSearch`.

## Backend (server functions)

Tạo `src/lib/purchases-dashboard.functions.ts`:
- `purchasesDashboard()` — trả `{ kpi, trend, aging, overdue, top_suppliers }` đối xứng `salesDashboard`. Đọc `invoices` + `supplier_payments`.

Mở rộng `src/lib/payables.functions.ts`:
- `listSupplierPayments({ from, to, method })` — danh sách phiếu chi (giống `listReceipts`).
- `payablesStats({ from, to })` — `{ total, count, cash, bank, outstanding }`.
- `listOutstandingPurchaseInvoices()` — cho dialog "Phiếu chi" pick hoá đơn.
- `deleteSupplierPayment({ id })` — xoá + đảo bút toán.
- Mở rộng `recordPayment`: chấp nhận `notes`, `pay_date`, ghi bút toán đối ứng (Nợ 331 / Có 111|112).

Không đổi schema (bảng `invoices`, `supplier_payments` đã có). Chỉ thêm cột `notes` nếu thiếu — kiểm tra trước khi migrate.

## Component & code reuse

Tách từ `/sales/index.tsx` các pattern dùng chung sang `src/components/sales-hub/` (hoặc giữ inline tại `/purchases/index.tsx` clone từ `/sales`). Để đơn giản, **clone trực tiếp** và đặt vào `/purchases/index.tsx` — đổi tên TK, label, icon:
- `MoneyCard`, `MiniKpi`, `PaymentBadge` — copy.
- `NewReceiptDialog` → `NewPaymentDialog` (Nợ 331 / Có 111|112, preview bút toán).
- `NewReceiptInline` → `NewPaymentInline`.
- `InvoicesTab` mua hàng: cột Ngày · Số HĐ · NCC · Hạn TT · Tổng · Đã trả · Còn lại · TT · [Chi].
- `PaymentsTab`: Ngày · NCC · HĐ · Hình thức · Tham chiếu · Số tiền · Đối soát · [Xoá].
- `OverdueTab` + `TopSuppliersTab` — copy, đổi field.

Áp dụng responsive đã thống nhất ở `/sales`: header stack, money strip `grid-cols-2 md:grid-cols-4`, tabs icon-only mobile, table ẩn cột phụ `hidden md:table-cell`, filter card `grid grid-cols-2 sm:grid-cols-4 lg:flex`.

## Sidebar (`src/components/app-sidebar.tsx`)
Cụm "Mua hàng":
- ❌ Bỏ "Hoá đơn mua vào" (→ /purchases tab invoices)
- ❌ Bỏ "Công nợ phải trả" (→ /purchases tab payables)
- ✅ Thêm "Mua hàng (Tổng quan)" → `/purchases` (icon `ShoppingCart`)
- ✅ Giữ "Nhà cung cấp" → `/suppliers`

## File changes
**Tạo mới**
- `src/routes/_app/purchases/index.tsx` — hub (~1000 dòng, clone từ sales)
- `src/routes/_app/purchases/$id.tsx` — chi tiết (copy `/invoices/$id`, đổi link về `/purchases`)
- `src/lib/purchases-dashboard.functions.ts`

**Sửa**
- `src/lib/payables.functions.ts` — thêm 4 hàm + mở rộng `recordPayment`
- `src/routes/_app/invoices/index.tsx` → redirect
- `src/routes/_app/invoices/$id.tsx` → redirect tới `/purchases/$id`
- `src/routes/_app/payables/index.tsx` → redirect
- `src/components/app-sidebar.tsx` — cập nhật cụm Mua hàng
- `src/routes/_app/dashboard.tsx` — link `/invoices` → `/purchases`
- `src/routes/_app/suppliers/$id.tsx` — link `/invoices/$id` → `/purchases/$id`

**Không đụng**
- Schema database, RLS, triggers
- `/sales/*`, `/receipts/*`
- `extractInvoice` (OCR upload) — chỉ đổi nơi gọi (Upload trigger vào tab `invoices` của hub)

## Out of scope
- Quote/PO (đơn đặt hàng), Credit notes mua — chưa có.
- Đa tiền tệ, multi-currency on payments.
- Realtime collaboration.

## QA
- Mobile 360: header xuống dòng, money strip 2×2, tabs icon-only, mỗi dòng bảng ẩn cột phụ.
- Tablet 768: money 4 cột, tabs đầy đủ.
- Desktop 1280: tương đương `/sales` về mật độ thông tin.
- Quick-pay từ Top NCC / Overdue → mở dialog `NewPaymentDialog` preselect HĐ/NCC.
- Redirect `/invoices` & `/payables` còn giữ deep link cũ trong bookmarks.
