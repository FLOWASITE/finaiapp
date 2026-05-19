## Mục tiêu

Phát triển 8 báo cáo quản trị nằm trong nhóm sidebar **Quản trị → Bán hàng / Mua hàng** (theo ảnh đính kèm). Mỗi báo cáo có:

- Bộ lọc khoảng ngày (mặc định tháng hiện tại), filter phụ (KH/NCC/Nhân viên/Sản phẩm khi phù hợp).
- Bảng dữ liệu có tổng cộng, sticky header, format số `vi-VN`.
- Nút Export CSV và nút In.
- Chỉ đọc dữ liệu đã `posted/reviewed`, loại bỏ `void`.

## Danh sách báo cáo

### Bán hàng (`/sales-dashboard/reports/*`)

| # | Route | Tên | Nguồn dữ liệu |
|---|---|---|---|
| 1 | `…/detail` | Sổ chi tiết bán hàng | `sales_invoices` + `sales_invoice_lines` (mỗi dòng = 1 line, kèm số HĐ, ngày, KH, mặt hàng, SL, đơn giá, CK, VAT, thành tiền) |
| 2 | `…/summary-profit-by-item` | Tổng hợp lãi/lỗ theo mặt hàng | `sales_invoice_lines` group theo `product_id`; doanh thu − giá vốn (`products.unit_cost × qty`) → lãi/lỗ + % |
| 3 | `…/summary-qty-by-item` | Tổng hợp bán hàng theo số lượng sản phẩm | Group theo product: SL bán, doanh thu, VAT, tổng |
| 4 | `…/summary-by-customer` | Tổng hợp bán hàng theo khách hàng | Group theo `customer_id`: số HĐ, doanh thu trước VAT, VAT, tổng, đã thu, còn lại |
| 5 | `…/summary-by-salesperson` | Tổng hợp bán hàng theo nhân viên | Join `sales_invoices → sales_orders.salesperson_id → employees`. HĐ không có SO ghi nhóm "Không xác định" |
| 6 | `…/summary-by-customer-item` | Tổng hợp bán hàng theo khách hàng & sản phẩm | Group (customer, product): SL, doanh thu, tổng |
| 7 | `…/summary-by-salesperson-item` | Tổng hợp bán hàng theo nhân viên & sản phẩm | Group (salesperson, product) |

### Mua hàng (`/purchases/reports/*`)

| # | Route | Tên | Nguồn dữ liệu |
|---|---|---|---|
| 8 | `…/detail` | Sổ chi tiết mua hàng | `invoices` + `invoice_lines` (mỗi dòng = 1 line, kèm số HĐ, ngày, NCC, mặt hàng, SL, đơn giá, VAT, thành tiền) |
| 9 | `…/summary-by-item` | Tổng hợp mua hàng theo mặt hàng | Group theo `product_id`: SL mua, giá trị trước VAT, VAT, tổng, NCC chính |

## Thay đổi sidebar

Mở rộng mục "Quản trị" trong `REPORTS_SECTIONS` (`src/components/app-sidebar.tsx`) — chuyển từ 2 link phẳng thành 2 group "Bán hàng" & "Mua hàng", mỗi group có 2 sub-section "Sổ chi tiết" và "Tổng hợp" dùng cùng kiểu group nested như "Báo cáo tài chính".

Giữ link `Tổng quan bán hàng` (`/sales-dashboard` → redirect `/sales`) và `Tổng quan mua hàng` (`/purchases`) ở đầu mỗi group.

## Kiến trúc kỹ thuật

**Server functions** — thêm 2 file:

- `src/lib/sales-reports.functions.ts`: 7 server functions (`salesDetail`, `salesProfitByItem`, `salesQtyByItem`, `salesByCustomer`, `salesBySalesperson`, `salesByCustomerItem`, `salesBySalespersonItem`).
- `src/lib/purchase-reports.functions.ts`: 2 functions (`purchaseDetail`, `purchaseByItem`).

Mỗi function dùng `requireSupabaseAuth` middleware, nhận `{ fromDate, toDate, …filters? }` đã validate bằng zod, query qua `context.supabase` (RLS theo tenant), tổng hợp/aggregate trong JS (đơn giản, dữ liệu báo cáo thường <10k dòng/tháng). Trả `{ rows, totals }`.

**UI components** — mỗi báo cáo 1 route file dưới `src/routes/_app/sales-dashboard/reports.*.tsx` và `src/routes/_app/purchases/reports.*.tsx`. Dùng chung 1 component `<ReportShell>` mới (`src/components/reports/report-shell.tsx`) với:
- header tiêu đề + bộ lọc (DateRange, optional Combobox cho customer/supplier/salesperson/product)
- toolbar: Refresh, Export CSV, In
- `<Table>` shadcn với footer tổng
- empty state

Hàm export CSV chung: `src/lib/csv-export.ts` (chuyển rows + cột → blob, download).

**Không cần migration mới** — toàn bộ join đã khả thi với schema hiện tại (`sales_invoices ↔ sales_orders.salesperson_id ↔ employees`, `sales_invoice_lines.product_id ↔ products.unit_cost`).

## Cấu trúc file

```text
src/
  components/reports/report-shell.tsx           [mới]
  lib/
    csv-export.ts                                [mới]
    sales-reports.functions.ts                   [mới]
    purchase-reports.functions.ts                [mới]
  routes/_app/
    sales-dashboard/
      reports.detail.tsx                         [mới]
      reports.profit-by-item.tsx                 [mới]
      reports.qty-by-item.tsx                    [mới]
      reports.by-customer.tsx                    [mới]
      reports.by-salesperson.tsx                 [mới]
      reports.by-customer-item.tsx               [mới]
      reports.by-salesperson-item.tsx            [mới]
    purchases/
      reports.detail.tsx                         [mới]
      reports.by-item.tsx                        [mới]
  components/app-sidebar.tsx                     [sửa: REPORTS_SECTIONS Quản trị]
```

## Phạm vi loại trừ (sẽ không làm trong lần này)

- Không thêm cột `salesperson_id` cho `sales_invoices` (dùng join SO; HĐ không SO ghi "Không xác định").
- Không tính giá vốn theo phương pháp bình quân di động — chỉ dùng `products.unit_cost` hiện tại làm proxy giá vốn cho báo cáo lãi/lỗ (có ghi chú trên UI).
- Chưa xuất Excel/PDF — chỉ CSV và In trình duyệt ở bước này.
- Chưa thêm cơ chế "Yêu thích" (icon ⭐ trong ảnh) — sẽ làm sau nếu cần.
