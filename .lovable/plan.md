
# Đánh giá hiệu năng báo cáo kế toán

## 1. Trả lời nhanh các câu hỏi

**Q: Report đang đọc từ bảng giao dịch hay bảng tổng hợp?**
→ 100% đọc trực tiếp từ bảng giao dịch. Chưa có bảng tổng hợp (summary) hay materialized view nào. Ví dụ:
- `reports.functions.ts` (678 dòng), `ledgers.functions.ts`, `dashboard-overview.functions.ts`, `sales-dashboard.functions.ts`, `purchases-dashboard.functions.ts` đều `select` thẳng từ `journal_lines + journal_entries`, `sales_invoices`, `invoices`, `customer_receipts`, `supplier_payments`, `cash_vouchers`, `bank_vouchers`.

**Q: Dashboard doanh thu/tháng có tính lại toàn bộ HĐ mỗi lần mở?**
→ Có. `salesDashboard` / `dashboardOverview` mỗi lần gọi:
- Lấy **toàn bộ** sales_invoices 180 ngày + **toàn bộ** open invoices (không phân trang, không filter `tenant_id` ở SQL — đang dựa vào RLS).
- Lặp ở JS để gom theo tháng, aging, top customer.
- Không cache, không React Query staleTime dài, không materialized view.

**Q: Index theo tenant_id, ngày, account_code, customer_id, kỳ thuế… đã đủ chưa?**
→ Có một phần, còn thiếu các composite quan trọng:

Đã có:
- `invoices(tenant_id)`, `invoices(user_id, created_at)`
- `sales_invoices(tenant_id)`, `sales_invoices(user_id, issue_date)`
- `journal_entries(tenant_id)`, `journal_entries(user_id, entry_date)`
- `cash_vouchers(user_id, voucher_date)`, `bank_vouchers(bank_account_id, voucher_date)`
- Các index `(tenant_id, branch_id)`, `(tenant_id, project_id)`

**Thiếu (đây là nguyên nhân chính khi data lớn):**
- `journal_lines(account_code)` ← sổ cái filter `like '%'` không có index
- `journal_lines(entry_id)` ← join chính, hiện chỉ có PK
- `journal_lines(account_code, entry_id)` composite
- `(tenant_id, entry_date)` trên `journal_entries` — hiện đang dùng `user_id` thay vì `tenant_id`
- `(tenant_id, issue_date)` trên `sales_invoices` và `invoices` — query report luôn lọc theo tenant+ngày, nhưng index hiện là `(user_id, issue_date)` → planner phải dựa RLS sau khi quét.
- `(tenant_id, payment_status, status)` cho aging
- `customer_receipts(tenant_id, pay_date)`, `supplier_payments(tenant_id, pay_date)` — hiện chỉ có `tenant_id` đơn, query luôn kèm `pay_date >= ?`
- `customer_receipts(invoice_id)` đã có; `supplier_payments(invoice_id)` chưa có
- `einvoices(tenant_id, issue_date)` đã có theo `direction` — OK
- Index cho trạng thái: `(tenant_id, status)` cho invoices/sales_invoices (filter `.neq('void')`, `.eq('issued')`)

**Q: Đã đo thời gian từng báo cáo chưa? Report nào chậm nhất?**
→ Chưa có instrumentation. Cần thêm `console.time` / log latency vào từng server fn, hoặc trang admin "Report timings". Theo cấu trúc query, dự đoán chậm nhất khi data lớn:
1. `getTrialBalance` / `getGeneralLedger` — quét `journal_lines` 2 lần (opening + period) không có index `account_code`.
2. `salesDashboard` + `purchasesDashboard` — quét open invoices toàn bộ + payments toàn bộ.
3. `getJournal` với dimension filter — inner join `journal_entries` + 4 dim không có composite.

**Q: Materialized view / bảng tổng hợp / cache?**
→ Hiện **chưa có gì**:
- Không có MV.
- Không có bảng `monthly_summary` / `account_balance_snapshot`.
- React Query mặc định (không thấy `staleTime` lớn) → re-fetch mỗi mount.
- Không có Redis/KV cache.

## 2. Lộ trình tối ưu đề xuất (3 giai đoạn)

### Giai đoạn 1 — Index & query hygiene (rẻ, hiệu quả nhất, làm trước)
Migration bổ sung các composite index thiếu (liệt kê ở mục 1). Riêng `journal_lines` thêm:
```
(account_code, entry_id), (entry_id), (account_code) với INCLUDE(debit, credit)
```
Sửa query report đang dùng `.eq('user_id', userId)` → đổi sang `.eq('tenant_id', tenantId)` để match index mới (đồng bộ với batch tenant-scoping đang làm).

### Giai đoạn 2 — Aggregation tables + triggers
Tạo bảng tổng hợp được cập nhật incrementally bằng trigger:
- `account_period_balances(tenant_id, account_code, year, period_no, opening, debit, credit)` ← phục vụ Trial Balance, Sổ cái tức thời.
- `monthly_sales_summary(tenant_id, year_month, revenue, collected, count)` ← phục vụ sales/purchases dashboard.
- `invoice_outstanding_cache(tenant_id, invoice_id, remaining, days_late_bucket)` ← phục vụ aging.

Trigger update khi insert/update/delete `journal_lines`, `customer_receipts`, `supplier_payments`, `sales_invoices`.

Khi đó dashboard chỉ `SELECT` vài chục dòng thay vì quét vài chục nghìn hóa đơn.

### Giai đoạn 3 — Cache & UX
- React Query `staleTime: 60_000` cho dashboard, `invalidate` khi user post chứng từ.
- Optional: materialized view `mv_trial_balance_yearly` refresh bằng pg_cron mỗi đêm cho năm đã đóng kỳ.
- Thêm log latency vào mỗi serverFn (`console.time` → `stack_modern--server-function-logs`) để biết chính xác report nào chậm nhất khi production có data thật.

## 3. Khuyến nghị thứ tự thực thi
1. **Tuần này**: chạy migration giai đoạn 1 (chỉ thêm index, không đụng logic) — an toàn, không downtime.
2. **Tuần sau**: thêm instrumentation latency + trang admin xem timings.
3. **Khi dataset > ~50k journal_lines / tenant**: triển khai giai đoạn 2 (summary tables + trigger).
4. **Khi có nhiều tenant đồng thời / >1M dòng**: thêm cache layer + nâng size Lovable Cloud instance (Backend → Advanced settings → Upgrade instance).

## Câu hỏi cho bạn
Bạn muốn mình bắt đầu ngay với **Giai đoạn 1 (thêm composite index)** trong một migration duy nhất không? Hay làm song song cả instrumentation latency để có số liệu trước khi tối ưu sâu hơn?
