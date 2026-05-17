## Bối cảnh

Hiện phân hệ bán hàng đang nằm ở 3 route riêng:
- `/sales-dashboard` — KPI, biểu đồ, tuổi nợ, top khách, HĐ quá hạn
- `/sales` — danh sách hoá đơn bán
- `/receipts` — phiếu thu

Trên Xero, toàn bộ luồng bán hàng nằm trong **một trang "Sales overview"** (menu *Business → Invoices*) gồm 4 khối:
1. **Money strip** trên cùng — 4 thẻ trạng thái có thể click để lọc: *Draft · Awaiting Approval · Awaiting Payment · Overdue*
2. **Biểu đồ "Invoices owed to you"** + **"Money coming in"** (dòng tiền dự kiến theo tuần/aging)
3. **Quick actions** — `+ New` (Invoice / Quote / Credit note / Receipt)
4. **Tabs phía dưới**: *Invoices · Awaiting payment · Paid · Receipts (Activity)* — cùng table, đổi filter

Mục tiêu: gộp 3 route trên thành **một trang `/sales` duy nhất theo mô hình Xero**, giữ nguyên logic backend hiện có.

## Cấu trúc mới đề xuất

```
/sales                          ← trang gộp (Sales overview)
 ├─ Money strip (4 thẻ click-to-filter)
 ├─ Charts: Doanh thu vs Đã thu · Aging pie · (collected 30/60/90)
 ├─ Action bar: [+ Tạo HĐ] [+ Phiếu thu] [Xuất CSV]
 └─ Tabs:
     ├─ Hoá đơn (mặc định)      ← bảng sales_invoices, filter theo money-strip
     ├─ Phiếu thu               ← bảng customer_receipts
     ├─ Quá hạn                 ← invoices payment_status = overdue
     └─ Top khách nợ            ← bảng top_customers (đã có)
```

Các trang chi tiết `/sales/$id` giữ nguyên.

## Thay đổi cụ thể

### 1. Tạo `src/routes/_app/sales/index.tsx` mới (overview hub)
- Lấy lại nội dung `sales-dashboard/index.tsx` làm khung trên (KPI strip + charts)
- Đổi 4 KPI card thành **money strip click-to-filter** (Xero style): bấm "Quá hạn" → tabs nhảy sang Hoá đơn + filter `payment_status=overdue`
- Bên dưới là **Tabs** (shadcn `Tabs` component) với 4 tab:
  - **Hoá đơn** — import list hiện có từ `sales/index.tsx` (chuyển thành component `<SalesInvoicesTable />`)
  - **Phiếu thu** — import list từ `receipts/index.tsx` (chuyển thành `<ReceiptsTable />`)
  - **Quá hạn** — `<SalesInvoicesTable filter="overdue" />`
  - **Top khách nợ** — bảng top_customers + nút "Thu" như đã có
- Nút `+ Tạo phiếu thu` mở `<NewReceiptDialog />` (đã có sẵn)
- Nút `+ Tạo hoá đơn` link sang `/sales/new` (giữ nguyên flow tạo HĐ hiện tại)

### 2. Tách 2 component để tái sử dụng
- `src/components/sales/sales-invoices-table.tsx` — bóc từ `sales/index.tsx`, nhận props `filter`, `search`, `dateRange`
- `src/components/sales/receipts-table.tsx` — bóc từ `receipts/index.tsx`, nhận props tương tự
- Reuse `NewReceiptDialog` (đã extract sẵn trong receipts page — chỉ cần move ra `components/sales/new-receipt-dialog.tsx`)

### 3. Xoá route cũ + redirect
- `src/routes/_app/sales-dashboard/index.tsx` → xoá, hoặc set `beforeLoad: throw redirect({ to: "/sales" })`
- `src/routes/_app/receipts/index.tsx` → xoá, hoặc redirect sang `/sales?tab=receipts`
- Giữ search-param `?invoice=…` và `?customer=…` (dashboard đã trỏ tới) — chuyển sang `/sales?tab=receipts&invoice=…`

### 4. Sidebar
Trong `src/components/app-sidebar.tsx`:
- Bỏ 2 mục "Dashboard bán hàng" và "Phiếu thu"
- Đổi mục "Hoá đơn bán" → **"Bán hàng"** với icon `Receipt`, route `/sales`
- Sub-menu (optional) hiển thị khi expand: Hoá đơn · Phiếu thu · Quá hạn

### 5. URL state cho tabs
- `/sales?tab=invoices|receipts|overdue|customers&status=…`
- Dùng `validateSearch` để typed search params; default `tab=invoices`

## Kỹ thuật

- Không đụng tới `*.functions.ts` (logic backend, journal 111/112↔131 giữ nguyên)
- Không migration DB
- Reuse `useQuery` keys hiện có để cache xuyên tab (chuyển tab không gọi lại API)
- Sticky money-strip + sticky tab header để UX giống Xero (luôn thấy filter khi cuộn bảng dài)

## Ngoài phạm vi turn này

- Quotes / Credit notes (Xero có, ta chưa làm — sẽ tab disabled "Sắp ra mắt" nếu cần)
- Statements khách hàng (đã có trong `/receivables`, để link riêng)
- Realtime collaborator presence
