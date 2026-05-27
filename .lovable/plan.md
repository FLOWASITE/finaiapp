## Mục tiêu
Bổ sung mẫu **B03-DNN — Báo cáo lưu chuyển tiền tệ (trực tiếp)** theo Thông tư 133/2016/TT-BTC, áp dụng động theo `accounting_standard` của tổ chức (giống cách đã làm cho B01, B02). Bỏ qua phương pháp gián tiếp ở tài liệu — hệ thống hiện chỉ hỗ trợ phương pháp trực tiếp.

## So sánh cấu trúc B03 trực tiếp: TT133 vs TT99

| Mã | TT133 (DNN) | Khác biệt |
|----|-------------|-----------|
| 01–07 | Hoạt động kinh doanh | **Giống TT99** |
| 20 | LCT thuần HĐKD | giống |
| **II. Hoạt động đầu tư** | | **TT133 gộp lại còn 5 dòng** |
| 21 | Chi mua sắm, xây dựng TSCĐ, BĐSĐT, TS dài hạn khác | giống TT99 |
| 22 | Thu từ thanh lý, nhượng bán TSCĐ, BĐSĐT… | giống TT99 |
| **23** | **Chi cho vay, đầu tư góp vốn vào đơn vị khác (gộp)** | TT99 tách 23 + 25 |
| **24** | **Thu hồi cho vay, đầu tư góp vốn vào đơn vị khác (gộp)** | TT99 tách 24 + 26 |
| **25** | **Thu lãi cho vay, cổ tức và lợi nhuận được chia** | TT99 là mã 27 |
| 30 | LCT thuần HĐ đầu tư | công thức theo 21..25 |
| **III. Hoạt động tài chính** | | **TT133 gộp lại còn 5 dòng** |
| 31 | Thu từ phát hành cổ phiếu, nhận vốn góp | giống |
| 32 | Trả vốn góp, mua lại cổ phiếu | giống |
| 33 | Thu từ đi vay | giống |
| **34** | **Trả nợ gốc vay và nợ thuê tài chính (gộp)** | TT99 tách 34 + 35 |
| **35** | **Cổ tức, lợi nhuận đã trả cho chủ sở hữu** | TT99 là mã 36 |
| 40 | LCT thuần HĐ tài chính | công thức theo 31..35 |
| 50, 60, 61, 70 | Tổng hợp | giống |

## Thay đổi mã

### 1. `src/lib/report-mappings.ts`
- Thêm `export const B03_TT133: CFItem[]` với cấu trúc trên. Giữ nguyên kiểu `CFItem`. Counterpart prefixes:
  - 23: `["1283", "128", "228", "221", "222"]` direction outflow (gộp cho vay + góp vốn)
  - 24: cùng prefixes, direction inflow
  - 25: `["515"]` inflow
  - 34: `["341", "3431", "3432", "3412"]` outflow (gộp nợ gốc vay + thuê TC)
  - 35: `["421", "3388"]` outflow (cổ tức)
- Các mục I và tổng hợp giữ nguyên prefixes như TT99.

### 2. `src/lib/reports.functions.ts`
- Thêm helper `resolveCfMapping(supabase, userId) → { mapping: CFItem[]; circular: "TT99" | "TT133" }`.
- `getCashFlowDirect`: dùng mapping động thay cho `B03_TT99` cứng; trả thêm `circular` trong response.
- `drilldownReportItem` nhánh `data.report === "B03"`: tra cứu và replay theo mapping động (cả `find` ở dòng 37 lẫn vòng replay ở dòng 86).
- `exportReportXlsx` nhánh B03 (dòng 688/700): dùng mapping động và đổi label tiêu đề `B03-DNN`/`B03-DN` theo standard.

### 3. `src/routes/_app/reports/index.tsx`
- Tab "B03 — LCTT": tiêu đề `ReportCard` và `PrintHeader` đổi động:
  - TT133 → "Mẫu B03-DNN (Thông tư 133/2016/TT-BTC) — phương pháp trực tiếp"
  - TT99 → giữ nguyên "Mẫu B03-DN (Thông tư 99/2025/TT-BTC) — phương pháp trực tiếp"
- Đọc `(cf.data as any)?.circular` (đã thêm ở bước 2).

## Không thay đổi
- Schema DB.
- Phương pháp gián tiếp (chưa hỗ trợ).
- Logic B01, B02 và các phần khác.
