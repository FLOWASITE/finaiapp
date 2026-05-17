## Bối cảnh

**Thông tư 99/2025/TT-BTC** (ban hành 27/10/2025, hiệu lực 01/01/2026) thay thế TT200/2014. Thay đổi chính ảnh hưởng đến module Báo cáo của AccuVN:

- "Bảng cân đối kế toán" → **"Báo cáo tình hình tài chính" (B01-DN)** (tên + cấu trúc IFRS-like)
- Bổ sung chỉ tiêu mới (vd. *Tài sản sinh học*), sắp xếp lại theo Tài sản ngắn hạn/dài hạn
- Mã số chỉ tiêu cố định (không được đánh lại), chỉ tiêu không có số liệu được phép ẩn
- B02-DN KQKD, B03-DN Lưu chuyển tiền tệ (trực tiếp & gián tiếp), B09-DN Thuyết minh
- Có bộ báo cáo riêng cho DN **không hoạt động liên tục** (DNKLT) và **giữa niên độ** (đầy đủ + tóm lược)

## Hiện trạng

`src/lib/reports.functions.ts` + `src/routes/_app/reports.tsx` đang triển khai mức rất sơ sài theo TT133:
- BCĐKT gom theo prefix 1/2/3/4 — không có mã số chỉ tiêu, không phân tách ngắn hạn/dài hạn
- KQKD chỉ liệt kê doanh thu/chi phí theo account, không theo Mã số 01–60 chuẩn TT
- LCTT gom thô theo classifier 21/22/24/34/41 — chưa đúng cấu trúc Mã số 01–70
- Chưa có Thuyết minh, chưa xuất Excel/PDF, chưa lưu kỳ báo cáo

## Phạm vi (Phase 7)

### A. Báo cáo tình hình tài chính B01-DN (TT99)

Map account → **mã số chỉ tiêu** theo Phụ lục IV TT99. Cấu trúc:

```text
A. TÀI SẢN NGẮN HẠN                          (100)
  I.   Tiền và tương đương tiền              (110)  111, 112, 113
  II.  Đầu tư tài chính ngắn hạn             (120)  121, 128, 229
  III. Phải thu ngắn hạn                     (130)  131, 136, 138, 141, 151, 244, 2293
  IV.  Hàng tồn kho                          (140)  151–158, 2294
  V.   Tài sản ngắn hạn khác                 (150)  133, 242, 333, 338
B. TÀI SẢN DÀI HẠN                            (200)
  I.   Phải thu dài hạn                      (210)
  II.  Tài sản cố định                       (220)  211/214, 212/214, 213/214
  III. Bất động sản đầu tư                   (230)  217/2147
  IV.  Tài sản dở dang dài hạn               (240)  241
  V.   Đầu tư tài chính dài hạn              (250)  221, 222, 228, 2292
  VI.  Tài sản dài hạn khác                  (260)  242, 243, 244
  VII. Tài sản sinh học (MỚI TT99)           (270)
TỔNG CỘNG TÀI SẢN                            (280)

C. NỢ PHẢI TRẢ                                (300)
  I.   Nợ ngắn hạn                           (310)  331, 333, 334, 335, 3382-3389, 341 ngắn hạn …
  II.  Nợ dài hạn                            (330)  341 dài hạn, 343 …
D. VỐN CHỦ SỞ HỮU                             (400)
  I.   Vốn chủ                               (410)  411, 412, 413, 414, 418, 421, 441 …
  II.  Nguồn kinh phí và quỹ khác            (430)
TỔNG NGUỒN VỐN                               (440)
```

- Hỗ trợ cột "Số đầu năm" và "Số cuối kỳ"
- Tự ẩn dòng có cả 2 cột = 0
- Lưu mã số chuẩn, không đánh lại

### B. KQKD B02-DN

Cấu trúc mã số chuẩn (01 doanh thu bán hàng, 02 các khoản giảm trừ, 10 doanh thu thuần, 11 GVHB, 20 lợi nhuận gộp, 21 doanh thu HĐTC, 22 chi phí TC, 25 chi phí bán hàng, 26 chi phí QLDN, 30 LNT, 31 thu nhập khác, 32 chi phí khác, 40 LN khác, 50 LNTT, 51 chi phí thuế TNDN, 60 LNST) — map từ 511/521/632/635/515/641/642/711/811/821.

### C. LCTT B03-DN — phương pháp trực tiếp

Mã số 01–70: Thu từ bán hàng (01), Chi trả NCC (02), Chi trả NLĐ (03), Chi nộp thuế (05), Tiền lãi vay đã trả (04), … Hoạt động đầu tư (21–30), Hoạt động tài chính (31–40). Giữ phương pháp đơn giản hiện tại làm fallback.

### D. B09-DN Thuyết minh

Sinh tự động các phần cố định: chính sách kế toán áp dụng, đặc điểm hoạt động DN (từ `profiles`), chi tiết tăng/giảm TSCĐ (từ `fixed_assets` + `depreciation_entries`), chi tiết phải thu/phải trả theo tuổi nợ, hàng tồn kho theo SP. Phần văn bản cho phép người dùng chỉnh sửa & lưu.

### E. UX

- Tab cho B01 / B02 / B03 / B09 thay vì 3 thẻ song song
- Bộ lọc: Năm tài chính, Quý (1–4), Tháng, Kỳ tuỳ chọn; auto chọn năm theo `profiles.fiscal_year_start`
- Cột So sánh: Kỳ này / Kỳ trước (đầu năm hoặc cùng kỳ năm trước)
- Toggle "Ẩn chỉ tiêu = 0" (mặc định bật)
- Nút **Xuất Excel** mỗi báo cáo (sử dụng `xlsx` skill, theo Phụ lục IV)
- Nút **In** (print-friendly CSS)
- Badge cảnh báo nếu kỳ đã khoá (`period_locks`) — chỉ hiển thị read-only

### F. Database

Thêm bảng `report_snapshots` để lưu BCTC đã chốt (kỳ + JSON nội dung) → audit trail, không phải tính lại:

```sql
CREATE TABLE public.report_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  report_type text NOT NULL,        -- 'B01' | 'B02' | 'B03' | 'B09'
  period_from date,
  period_to date NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- RLS: own report_snapshots
```

Thêm bảng `report_notes` cho phần văn bản B09 (chính sách, thuyết minh tự nhập):

```sql
CREATE TABLE public.report_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  section text NOT NULL,             -- 'policy.depreciation', 'policy.inventory', 'note.custom.1' …
  content text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, section)
);
```

Cập nhật `profiles.accounting_standard` default → `'TT99'` cho user mới (giữ `'TT133'`/`'TT200'` cho user cũ; B01 mapping chọn theo giá trị này).

### G. Chi tiết kỹ thuật

- Tạo `src/lib/report-mappings.ts`: hằng số mapping `MA_SO_B01_TT99`, `MA_SO_B02`, `MA_SO_B03` (account code → mã số + dấu).
- Refactor `reports.functions.ts`:
  - `getBalanceSheetTT99({ asOf, compareWith })` → trả về `{ items: [{ ma_so, name, level, current, previous }], totals }`
  - `getIncomeStatementTT99({ from, to, compareFrom?, compareTo? })`
  - `getCashFlowDirect({ from, to })` & giữ `getCashFlowIndirect` cũ
  - `getNotes({ from, to })` cho B09
  - `saveSnapshot`, `listSnapshots`, `getSnapshot`
  - `upsertReportNote`, `listReportNotes`
- Tất cả check `is_period_locked` cho thao tác chốt snapshot
- Xuất Excel: server-side `xlsx` (đã có trong devDeps?) — nếu chưa, dùng `exceljs` (Worker-compatible) tạo workbook đúng Phụ lục IV, trả về base64 cho client tải.

### H. Ngoài phạm vi (để sau)

- DN không hoạt động liên tục (B01-DNKLT)
- Báo cáo giữa niên độ dạng tóm lược B016/B026/B036
- Hợp nhất công ty mẹ-con
- Chuyển đổi tự động số dư đầu kỳ TT133/TT200 → TT99
- XBRL/eXML nộp Thuế

## File dự kiến

**Mới**
- `src/lib/report-mappings.ts`
- `src/lib/report-export.ts` (Excel)
- `src/routes/_app/reports/index.tsx` (tabs)
- `src/routes/_app/reports/notes.tsx` (chỉnh B09)
- 2 migration: `report_snapshots`, `report_notes` + RLS

**Sửa**
- `src/lib/reports.functions.ts` (refactor lớn)
- `src/routes/_app/reports.tsx` → redirect tới `/reports` index
- `src/components/app-sidebar.tsx` (nếu cần submenu Báo cáo)

## Câu hỏi cần xác nhận

1. **Chuẩn áp dụng**: triển khai mặc định **TT99** (mới), hay giữ TT133 cho DN nhỏ & thêm tuỳ chọn TT99? AccuVN hiện default `TT133`.
2. **Xuất file**: Excel theo Phụ lục IV là đủ, hay cần thêm PDF in sẵn?
3. **B09 Thuyết minh**: tự sinh tối thiểu (TSCĐ + tồn kho + công nợ) + cho phép user nhập tay phần chính sách, OK?
4. **LCTT**: làm phương pháp **trực tiếp** (chuẩn TT99 khuyến nghị) hay **gián tiếp**, hay cả hai?
