## Mục tiêu

Thay thế trang `/dashboard` (hiện chỉ có 3 thẻ cơ bản) bằng **Trang chủ kế toán** chuẩn Xero/QuickBooks: nhìn 1 màn hình là nắm được sức khoẻ tài chính, dòng tiền, công nợ và việc cần làm.

## Layout (responsive)

```text
┌─────────────────────────────────────────────────────────┐
│ Header: Chào {tên}, kỳ {tháng/năm} · [Bộ lọc kỳ]        │
├─────────────────────────────────────────────────────────┤
│ KPI STRIP (5 thẻ)                                       │
│ [Doanh thu] [Chi phí] [Lợi nhuận] [Tiền mặt+NH] [Số dư] │
├──────────────────────────┬──────────────────────────────┤
│ Cash flow 6 tháng        │ Bank & Cash accounts         │
│ (bar/line: Thu/Chi/Net)  │ (list balances + reconcile)  │
├──────────────────────────┼──────────────────────────────┤
│ Phải thu (AR) Aging      │ Phải trả (AP) Aging          │
│ Donut + Top 5 KH         │ Donut + Top 5 NCC            │
├──────────────────────────┼──────────────────────────────┤
│ Hoá đơn cần xử lý        │ P&L tóm tắt (tháng này)      │
│ - Quá hạn, Sắp đến hạn   │ Doanh thu / GVHB / Chi phí   │
│ - Chờ duyệt (AI bóc)     │ Lãi gộp / Lãi ròng           │
├──────────────────────────┴──────────────────────────────┤
│ Bút toán gần đây (10 dòng)  ·  Quick actions             │
└─────────────────────────────────────────────────────────┘
```

- Mobile (<768px): xếp 1 cột, KPI strip cuộn ngang snap.
- Tablet (768–1280): KPI 2x3, các khối 1 cột.
- Desktop (≥1280): bố cục như trên.

## Thành phần chính

**1. KPI Strip (kỳ chọn: Tháng / Quý / YTD)**
- Doanh thu (sales_invoices đã phát hành, trừ void)
- Chi phí (invoices mua + cash_vouchers loại chi)
- Lợi nhuận ròng ước tính (Doanh thu − Chi phí)
- Tổng tiền (sum số dư bank_accounts + quỹ tiền mặt từ cash_vouchers)
- Số dư công nợ ròng (AR − AP)

Mỗi KPI: số to + delta so với kỳ trước + sparkline 30 ngày.

**2. Cash Flow Chart (6 tháng gần nhất)**
- Bar chồng: Thu (customer_receipts) vs Chi (supplier_payments + cash_vouchers chi)
- Đường: Net cash flow
- Recharts ComposedChart

**3. Bank & Cash Accounts**
- List bank_accounts với số dư (computed từ bank_transactions)
- Tiền mặt tổng từ cash_vouchers
- Badge "X giao dịch chưa đối soát" + nút "Đối soát"

**4. AR Aging + Top 5 Khách hàng**
- Donut: Current / 1-30 / 31-60 / 61-90 / 90+
- Bảng top 5 KH theo công nợ + nút "Thu"
- Tận dụng `salesDashboard().aging` & `top_customers`

**5. AP Aging + Top 5 Nhà cung cấp**
- Tương tự, dùng `purchasesDashboard().aging` & `top_suppliers`

**6. Hoá đơn cần xử lý**
- Tab: Quá hạn / Sắp đến hạn 7 ngày / Chờ duyệt (status: pending|extracted|reviewed)
- Click → đi đến `/sales/$id` hoặc `/invoices/$id`

**7. P&L tóm tắt (tháng hiện tại)**
- Doanh thu thuần, Giá vốn, Lãi gộp, Chi phí vận hành, Lãi ròng
- Link "Xem báo cáo đầy đủ" → `/reports`

**8. Bút toán gần đây**
- 10 journal_entries mới nhất, hiển thị ngày/diễn giải/Nợ/Có
- Link → `/journal`

**9. Quick Actions**
- Tạo hoá đơn bán · Ghi nhận thu · Ghi nhận chi · Upload hoá đơn mua · Xem báo cáo

## Backend

Tạo `src/lib/dashboard-overview.functions.ts` với `dashboardOverview({ period: 'month'|'quarter'|'ytd' })` trả về 1 payload tổng hợp (gọi song song nhiều query). Tái sử dụng tối đa logic từ `sales-dashboard.functions.ts` & `purchases-dashboard.functions.ts`:

- KPI period vs previous period
- Cash flow theo tháng (6 tháng)
- Bank balances + cash on hand
- AR/AP aging + top parties (đã có)
- Pending invoices counts
- P&L compact (tái dùng `reports.functions.ts` nếu có hàm pnl)
- Recent 10 journal_entries

## Frontend

- Viết lại `src/routes/_app/dashboard.tsx` (giữ route, thay nội dung)
- Components con tách trong cùng file hoặc `src/components/dashboard/`:
  - `KpiStrip`, `CashFlowChart`, `BankAccountsCard`, `AgingCard` (dùng chung AR/AP), `PendingInvoicesCard`, `PnlSummaryCard`, `RecentJournalCard`, `QuickActions`
- Recharts cho biểu đồ (đã có), shadcn Card/Tabs/Badge/Button.
- Skeleton loading + empty states với CTA (vd: "Chưa có hoá đơn — Tạo ngay").
- Định dạng số VND (`Intl.NumberFormat('vi-VN')`).

## Technical details

- Không thêm bảng DB mới — toàn bộ dùng schema hiện có.
- Server fn: `createServerFn({ method: 'GET' }).middleware([requireSupabaseAuth]).handler(...)`.
- Period filter qua search params (`zodValidator` + `fallback`), default `month`.
- Tránh N+1: gộp query Supabase song song bằng `Promise.all`.
- TanStack Query: `queryKey: ['dashboard-overview', period]`, `staleTime: 60s`.

## Phạm vi loại trừ

- Không build budgeting/forecasting.
- Không tích hợp ngân hàng feeds tự động.
- Không multi-currency conversion (giả định VND).
- Không drag-and-drop widget (cố định layout).

## QA checklist

- 360/768/1280: layout không vỡ, KPI strip cuộn được ở mobile.
- Tài khoản trống dữ liệu: hiện empty state, không lỗi.
- Period switch (Tháng/Quý/YTD): số đổi đúng, delta hiển thị đúng dấu.
- Click các card điều hướng đến trang chi tiết đúng.
