## Mục tiêu

Áp dụng đồng nhất component `DateRangeFilter` (như đang dùng ở tab **Sổ quỹ tiền mặt** — `/cash`) cho mọi màn hình có dữ liệu theo thời gian nhưng hiện chưa có bộ lọc kỳ. Với những trang đã có ô `Input[type="date"]` thủ công, **thay** bằng `DateRangeFilter` để giữ trải nghiệm thống nhất (preset "Hôm nay / Tuần này / Tháng này / Quý / Năm…" + ô tuỳ chọn).

Không động vào logic backend, không đổi cấu trúc bảng/sửa server functions — chỉ thay/cắm UI filter và truyền `from`/`to` vào query đã có sẵn.

## Trạng thái hiện tại

**Đã có `DateRangeFilter`** (giữ nguyên):
- `/cash` (tab Sổ quỹ), `/tax`, `/einvoices`, `/invoices`
- `/reports/*` (index, voucher-list, ar-summary, ap-summary, ledgers, stock-ios, trial-balance)

**Có ô date thủ công → cần thay bằng `DateRangeFilter`:**
- `bank.book.tsx`, `bank.vouchers.tsx`, `bank.reconcile.tsx`
- `purchases/vouchers.tsx`, `sales/vouchers.tsx`, `sales/orders.tsx`
- `admin/audit.tsx`, `einvoices/digest.tsx`

**Chưa có bộ lọc kỳ nào → cần thêm `DateRangeFilter`:**
- `journal.tsx` (Sổ nhật ký chung)
- `cashflow.tsx` (Dòng tiền)
- `payables/index.tsx`, `receivables/index.tsx`, `receipts/index.tsx`
- `inventory/movements.tsx`, `inventory/stock-card.tsx`, `inventory/vouchers-in.tsx`, `inventory/vouchers-out.tsx`, `inventory/stock-takes.tsx`
- `purchases/index.tsx`, `purchases/reports.detail.tsx`, `purchases/reports.by-item.tsx`
- `sales/index.tsx`
- `reports/allocation-schedule.tsx`
- `documents/index.tsx`, `inbox.tsx`
- `superadmin/audit.tsx`
- `assets/events.tsx`, `assets/disposal.tsx`, `assets/reclassify.tsx`, `assets/inventory.tsx`, `assets/reports.tsx`

**Ngoài phạm vi (không thêm):**
- Form Tạo/Sửa phiếu (ô ngày là 1 ngày, không phải khoảng).
- `dashboard.tsx`, `setup.tsx`, `settings/*`, `chat/*`, `coa/*`, `customers/*`, `suppliers/*`, `items/*` — không phải báo cáo/giao dịch theo kỳ.
- `bank.import-statement.tsx` — chỉ là wizard upload, không liệt kê theo kỳ.

## Pattern áp dụng

Mỗi trang dùng cùng 1 khuôn:

```tsx
import { DateRangeFilter } from "@/components/date-range-filter";
import { firstOfMonthISO, todayISO } from "@/lib/date-presets"; // hoặc inline

const [from, setFrom] = useState(firstOfMonthISO());
const [to, setTo] = useState(todayISO());

// trên toolbar
<DateRangeFilter from={from} to={to} onChange={(r) => { setFrom(r.from); setTo(r.to); }} />

// queryKey include from/to để re-fetch khi đổi kỳ
useQuery({ queryKey: ["xxx", from, to], queryFn: () => fn({ data: { from, to } }) })
```

Quy tắc preset mặc định theo loại trang:
- **Sổ / nhật ký / giao dịch trong kỳ** → "Tháng này" (`firstOfMonthISO → todayISO`).
- **Báo cáo / phân tích** → "Năm nay" (giữ giống `/reports/*` hiện tại).
- **Audit log** → "7 ngày gần nhất".

## Phân nhóm công việc

### Nhóm A — Thay ô date có sẵn (8 file)
Refactor: bỏ 2 `<Input type="date">`, dùng `DateRangeFilter` chiếm 1 vị trí trong toolbar.
- `bank.book.tsx`, `bank.vouchers.tsx`, `bank.reconcile.tsx`
- `purchases/vouchers.tsx`, `sales/vouchers.tsx`, `sales/orders.tsx`
- `admin/audit.tsx`, `einvoices/digest.tsx`

### Nhóm B — Thêm filter + bind vào server fn đã hỗ trợ `from/to` (cần kiểm tra signature)
- `journal.tsx` → lọc client trên `entry_date`, hoặc thêm tham số nếu server fn cho phép.
- `cashflow.tsx`
- `inventory/movements.tsx`, `inventory/stock-card.tsx`, `inventory/vouchers-in.tsx`, `inventory/vouchers-out.tsx`, `inventory/stock-takes.tsx`
- `purchases/index.tsx`, `purchases/reports.detail.tsx`, `purchases/reports.by-item.tsx`
- `sales/index.tsx`
- `reports/allocation-schedule.tsx`
- `payables/index.tsx`, `receivables/index.tsx`, `receipts/index.tsx`
- `assets/events.tsx`, `assets/disposal.tsx`, `assets/reclassify.tsx`, `assets/inventory.tsx`, `assets/reports.tsx`
- `documents/index.tsx`, `inbox.tsx`, `superadmin/audit.tsx`

Với trang nào server fn **chưa nhận** `from/to`: lọc **client-side** trên kết quả (tạm thời), không sửa backend trong lần này. Khi trang dùng `useSuspenseQuery` / loader của TanStack, vẫn để bộ lọc cập nhật state local (không đổi loader signature).

## Verify

- Build/typecheck pass.
- Mở từng trang trong danh sách, đảm bảo:
  - Nút chip `Từ {dd/MM/yyyy} đến {dd/MM/yyyy}` hiển thị giống `/cash` tab Sổ quỹ.
  - Đổi preset → bảng/biểu cập nhật.
  - Không vỡ layout toolbar hiện có (filter, search, nút Tạo mới).

## Ngoài phạm vi (lần sau)

- Lưu kỳ đã chọn vào URL (search params) hoặc localStorage.
- Đồng bộ kỳ giữa các trang qua context chung.
- Mở rộng `DateRangeFilter` để hỗ trợ so sánh 2 kỳ.
