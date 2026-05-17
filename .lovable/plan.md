## Phạm vi đã chốt
- **Ưu tiên 1:** Sổ sách kế toán (Nhật ký chung, Sổ cái, Sổ chi tiết TK, Bảng cân đối số phát sinh).
- **Ưu tiên 2:** Báo cáo thuế (Tờ khai GTGT 01/GTGT, Bảng kê hoá đơn, Quyết toán TNDN 03/TNDN, Quyết toán TNCN 05/QTT, xuất XML HTKK).
- **Cross-cutting:** Xuất PDF có chữ ký + header công ty; Drill-down từ chỉ tiêu BCTC → danh sách bút toán cấu thành.
- **Ngoài phạm vi:** Dashboard KPI/biểu đồ, B04, LCTT gián tiếp, multi-entity.

## Kiến trúc tổng thể

```text
src/routes/_app/reports/
├── index.tsx                  (đã có — BCTC: B01/B02/B03/B09)
├── ledgers.tsx                MỚI — Sổ sách kế toán
├── tax.tsx                    MỚI — Báo cáo thuế (GTGT, TNDN, TNCN)
└── drilldown.$code.tsx        MỚI — modal/route hiển thị bút toán theo chỉ tiêu

src/lib/
├── reports.functions.ts       (đã có — mở rộng thêm drill-down)
├── ledgers.functions.ts       MỚI — getJournal, getGeneralLedger, getAccountLedger, getTrialBalance
├── tax.functions.ts           MỚI — getVATReturn, getVATInvoiceList, getCITReturn, getPITAnnual
├── pdf-export.functions.ts    MỚI — renderReportPdf (pdfkit/jspdf)
├── xml-htkk.ts                MỚI — buildVATXml, buildCITXml, buildPITXml (mẫu HTKK)
└── report-mappings.ts         (đã có)
```

## Phase 1 — Sổ sách kế toán (Ledgers)

**Server functions** (`src/lib/ledgers.functions.ts`):
- `getJournal({from, to, search?})` → Nhật ký chung: list `journal_entries` + `journal_lines`, sắp theo `entry_date`, `created_at`.
- `getGeneralLedger({from, to, accountPrefix?})` → Sổ cái: gom theo `account_code`, mỗi TK có opening balance + phát sinh + closing.
- `getAccountLedger({account, from, to})` → Sổ chi tiết 1 TK (số dư lũy kế từng dòng).
- `getTrialBalance({from, to})` → Bảng cân đối số phát sinh: theo TK, cột (Dư đầu N/C, PS N/C, Dư cuối N/C). Opening = sum trước `from`; phát sinh = trong kỳ.

**UI** (`/reports/ledgers`):
- Tabs: Nhật ký chung | Sổ cái | Sổ chi tiết TK | Cân đối phát sinh.
- Filter chung: từ-đến ngày, account picker (dùng `chart_of_accounts` đã seed TT99).
- Mỗi dòng có icon mở Drill-down (chuyển sang phase 3) hoặc link tới `/journal/$entryId`.
- Tổng cộng đặt sticky bottom.
- Nút "Xuất Excel" và "Xuất PDF" (phase 4).

## Phase 2 — Báo cáo thuế

**Server functions** (`src/lib/tax.functions.ts`):
- `getVATInvoiceList({from, to, direction: "in"|"out"})` → Bảng kê hoá đơn:
  - Đầu ra: từ `sales_invoices` + `sales_invoice_lines` (gom theo `vat_rate` 0/5/8/10).
  - Đầu vào: từ `invoices` (mua) đã `status="approved"`.
- `getVATReturn({month|quarter, year})` → Tờ khai 01/GTGT, các chỉ tiêu chuẩn:
  - [23] Giá trị HHDV mua vào, [24] Thuế GTGT đầu vào, [25] Khấu trừ kỳ này.
  - [26]-[33] Doanh thu chia theo thuế suất 0/5/10/KCT.
  - [40] Thuế phải nộp / [43] Còn được khấu trừ chuyển kỳ sau.
- `getCITReturn({year})` → 03/TNDN: lấy KQKD năm + điều chỉnh tăng/giảm (user nhập tay, lưu `report_notes`).
- `getPITAnnual({year})` → 05/QTT-TNCN: tổng hợp từ `payroll_lines` cả năm theo `employee_id`.

**UI** (`/reports/tax`):
- 4 tabs: Tờ khai GTGT | Bảng kê HĐ | Quyết toán TNDN | Quyết toán TNCN.
- VAT: chọn kỳ (tháng/quý + năm). Hiển thị form 01/GTGT theo dạng bảng chỉ tiêu (giống HTKK).
- Bảng kê HĐ: 2 sub-table (Mua/Bán), filter trạng thái thuế suất.
- TNDN/TNCN: bảng tổng hợp + cột "Điều chỉnh" cho phép user nhập, lưu `report_notes` section `tax.cit.<year>` / `tax.pit.<year>`.

**XML HTKK** (`src/lib/xml-htkk.ts`):
- Hàm build XML theo schema HTKK (root `<HSoThueDTu>` + `<DLieuTKhai>`).
- Mỗi tờ khai có template riêng: `01_GTGT.xml`, `03_TNDN.xml`, `05_QTT_TNCN.xml`.
- Nút "Tải XML HTKK" mỗi tab → gọi server fn build → tải xuống file.
- Lưu ý: cần MST từ `profiles.tax_id`, kỳ kê khai, mẫu số tờ khai (`01/GTGT` v1.x).

## Phase 3 — Drill-down chỉ tiêu BCTC

**Server function** mở rộng `reports.functions.ts`:
- `getReportItemEntries({report: "B01"|"B02"|"B03", maSo, from?, to?, asOf?})`
  - Lookup `B01_TT99[maSo].accounts` để biết prefix + nature.
  - Query `journal_lines` filter `account_code LIKE prefix%` + ngày phù hợp.
  - Return: list `{entry_date, description, account_code, debit, credit, entry_id, invoice_id?}`.

**UI:**
- Trong `reports/index.tsx`, mỗi dòng chỉ tiêu có `accounts` đính kèm → click mở `<Sheet>` (shadcn) hiển thị bảng bút toán.
- Mỗi dòng bút toán có link `/journal/$entryId` (route đã có hoặc cần kiểm tra).
- Hỗ trợ cho cả B01, B02, B03 (CFItem cần thêm `accounts` tương tự).

## Phase 4 — PDF có chữ ký

**Library:** `pdfmake` (Worker-compatible, pure JS, hỗ trợ table + footer + font Việt) hoặc `@react-pdf/renderer`. Chọn `pdfmake` vì dùng được server-side trong Worker.
- `bun add pdfmake` + font Vietnamese (Roboto/Inter có sẵn glyph VN).

**Server function** `src/lib/pdf-export.functions.ts`:
- `exportReportPdf({report, ...params})` → trả base64.
- Layout chuẩn:
  - Header: tên + MST + địa chỉ công ty (từ `profiles`), tên mẫu (B01-DN), kỳ báo cáo.
  - Body: table giống XLSX.
  - Footer: ngày... tháng... năm..., 3 ô ký (Người lập biểu | Kế toán trưởng | Giám đốc) lấy `profiles.signer_name`.
  - Số trang `x/y`.

**UI:** thêm nút "Xuất PDF" cạnh "Xuất Excel" ở mỗi `ReportCard` (B01/B02/B03, Sổ sách, Báo cáo thuế).

## Phase 5 — Tích hợp & QA

1. Thêm sidebar links: "Sổ sách kế toán" và "Báo cáo thuế" trong group "Báo cáo".
2. Mỗi function gắn `requireSupabaseAuth`; query `journal_entries`/`journal_lines` đã có RLS.
3. Tận dụng `report_snapshots` để cache tờ khai thuế đã kê khai (bonus, nếu kịp).
4. Smoke test: tạo vài bút toán mẫu → kiểm tra Sổ cái cân Trial Balance → cân với B01.
5. Build TS pass, không thêm Edge Function nào.

## Chi tiết kỹ thuật quan trọng

- **Opening balance Sổ cái:** = sum(debit-credit) tất cả `journal_lines` có `entry_date < from`, theo nature TK.
- **HTKK XML namespace:** dùng `<?xml version="1.0" encoding="UTF-8"?>` + chuẩn TCT (mã CQT, KyKKhai dạng "MM/YYYY" hoặc "Q/YYYY").
- **PDF font VN:** load `Roboto` base64 vào pdfmake `vfs` để render tiếng Việt có dấu chuẩn.
- **Drill-down hiệu suất:** với mã có nhiều prefix (ví dụ 100 = 110+120+...), query 1 lần lấy tất cả lines có `account_code LIKE ANY(...)`, lọc client.
- **Bảng cân đối phát sinh:** group theo TK cấp 1 (3 ký tự) + tổng cộng cuối — cân khi `sum(PS_N) = sum(PS_C)` và `sum(Dư cuối N) = sum(Dư cuối C)`.

## Kiểm tra hoàn thành

- `/reports/ledgers` 4 tab chạy, số liệu khớp B01.
- `/reports/tax` GTGT có 4 chỉ tiêu chính + xuất được XML mẫu.
- Click chỉ tiêu "Tiền và tương đương tiền" mở Sheet liệt kê các bút toán TK 111/112.
- Tải PDF B01 mở được, có header công ty + 3 ô ký.
- Build pass; không có warning RLS mới.
