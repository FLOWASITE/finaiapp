## Mục tiêu
Bổ sung mẫu Báo cáo Kết quả hoạt động kinh doanh **B02-DNN** theo Thông tư 133/2016/TT-BTC, tương tự cách đã làm cho Bảng cân đối (B01a-DNN). Khi tổ chức đặt `accounting_standard = 'TT133'`, tab "B02 — KQKD" hiển thị cấu trúc B02-DNN; ngược lại giữ nguyên B02-DN (TT99).

## So sánh cấu trúc B02-DNN (TT133) vs B02-DN (TT99)

| Mã | Chỉ tiêu (TT133) | Khác biệt so với TT99 |
|----|------------------|-----------------------|
| 01 | Doanh thu bán hàng và CCDV | giống |
| 02 | Các khoản giảm trừ doanh thu | giống |
| 10 | Doanh thu thuần (= 01 − 02) | giống |
| 11 | Giá vốn hàng bán | giống |
| 20 | Lợi nhuận gộp (= 10 − 11) | giống |
| 21 | Doanh thu hoạt động tài chính | giống |
| 22 | Chi phí tài chính | giống |
| 23 | — Trong đó: Chi phí lãi vay | giống |
| **24** | **Chi phí quản lý kinh doanh** | **Gộp 641 + 642** (TT99 tách 25/26) |
| 30 | LN thuần HĐKD (= 20 + 21 − 22 − 24) | công thức khác |
| 31 | Thu nhập khác | giống |
| 32 | Chi phí khác | giống |
| 40 | Lợi nhuận khác (= 31 − 32) | giống |
| 50 | Tổng LN trước thuế (= 30 + 40) | giống |
| **51** | **Chi phí thuế TNDN** | **Gộp** (TT99 tách 51/52) |
| 60 | LN sau thuế (= 50 − 51) | TT133 không có mã 52, không có EPS (70) |

Hạch toán theo TT133: dùng TK **642 "Chi phí quản lý kinh doanh"** cho mã 24, và **821** cho mã 51.

## Thay đổi mã

### 1. `src/lib/report-mappings.ts`
- Thêm hằng `B02_TT133: ISItem[]` với cấu trúc 16 dòng ở trên:
  - 24: `accounts: [E("641"), E("642")]` (gồm cả chi phí bán hàng + QLDN theo TT133)
  - 30: `formula: [20:+, 21:+, 22:−, 24:−]`
  - 51: `accounts: [E("821")]`
  - 60: `formula: [50:+, 51:−]`
  - Bỏ mã 25, 26, 52, 70.

### 2. `src/lib/reports.functions.ts`
- Thêm hàm `resolveIsMapping(standard)` → trả về `B02_TT133` hoặc `B02_TT99`.
- Cập nhật `getIncomeStatementTT99` (handler B02): dùng mapping động theo `tenant.accounting_standard`.
- Cập nhật phần drilldown (`getReportDrilldown`) ở nhánh `data.report === "B02"`: dùng mapping động thay vì hard-code `B02_TT99`.
- Cập nhật export CSV: lặp qua mapping động.

### 3. `src/routes/_app/reports/index.tsx`
- Tab "B02 — KQKD": tiêu đề và `PrintHeader` đổi động theo standard:
  - TT133 → "Báo cáo kết quả hoạt động kinh doanh (Mẫu B02-DNN — Thông tư 133/2016/TT-BTC)"
  - TT99 → giữ nguyên "Mẫu B02-DN — Thông tư 99/2025/TT-BTC"
- Tận dụng `getActiveCoaCircular` đã có để biết standard hiện hành.

## Không thay đổi
- Schema DB (không cần bảng mới — đây là bản đồ tài khoản tĩnh trong code).
- Logic B01, B03 và các phần khác.
- UI/UX tổng thể, chỉ thay nhãn và cấu trúc dòng của tab B02.
