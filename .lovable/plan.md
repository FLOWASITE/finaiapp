## Mục tiêu

Đưa **Hệ thống tài khoản kế toán doanh nghiệp theo TT 99/2025/TT-BTC** (Phụ lục II user vừa gửi) vào hệ thống — thay thế 38 dòng placeholder trong bảng `chart_of_accounts` hiện tại bằng bộ danh mục đầy đủ (~200 mã cấp 1 + cấp 2), và bổ sung UI quản lý/tra cứu.

## Phạm vi

### 1. Parse file Phụ lục II → danh mục TK chuẩn

- Viết script Node (`scripts/parse-coa.ts`) đọc file đã upload, bóc tách bảng A — Danh mục tài khoản (trang 1–4 của tài liệu) thành mảng `{ code, name, parent_code, type }`.
- Phân loại `type` theo loại TK:
  - Loại 1, 2 → `ASSET`
  - Loại 3 → `LIABILITY` (riêng 334–336, 353, 411–421 thuộc nhóm vốn/khác sẽ xử lý theo nhóm thật)
  - Loại 4 → `EQUITY`
  - Loại 5, 7 → `REVENUE`
  - Loại 6, 8 → `EXPENSE`
  - Loại 9 (911) → `RESULT`
- Cấp 2 (4 chữ số) `parent_code` = 3 chữ số đầu; cấp 1 `parent_code = null`.
- Output file SQL `supabase/migrations/<ts>_seed_coa_tt99.sql`.

### 2. Migration seed dữ liệu

- `DELETE FROM chart_of_accounts;` rồi `INSERT` toàn bộ ~200 dòng.
- Bổ sung cột mới nếu cần:
  - `is_active boolean default true`
  - `is_leaf boolean` (tự tính: true nếu không có TK con)
  - `level smallint` (1 hoặc 2)
- RLS giữ nguyên (read-only cho authenticated).

### 3. Cập nhật mapping báo cáo

- File `src/lib/report-mappings.ts`: rà lại các `accounts: ["1111", ...]` cho khớp mã TT99 mới (ví dụ TK 112 nay là "Tiền gửi không kỳ hạn", thêm 113 "Tiền đang chuyển", 128 nắm giữ đáo hạn có 1281–1288…).
- Bổ sung mã còn thiếu vào B01/B02 mapping (đã liệt kê trong plan trước).

### 4. UI tra cứu / quản lý

- Route mới `src/routes/_app/coa/index.tsx`:
  - Bảng cây 2 cấp (collapse theo cấp 1).
  - Search theo mã / tên, filter theo loại (Tài sản / Nợ phải trả / VCSH / Doanh thu / Chi phí / Khác).
  - Hiển thị badge "Đang dùng" nếu mã TK có xuất hiện trong `journal_lines`.
- Server fn `src/lib/coa.functions.ts`: `listAccounts()` + `getAccountUsage(code)`.
- Thêm link "Hệ thống tài khoản" vào sidebar (`src/components/app-sidebar.tsx`) dưới mục Cài đặt.

### 5. (Out of scope kỳ này)

- Cho phép user thêm TK chi tiết cấp 3+ (sẽ làm sau).
- Auto-suggest TK trong form bút toán dựa trên COA mới (đã có sẵn ô account_code text, chỉ cần đảm bảo COA seeded).

## Kỹ thuật

- Parser dùng regex trên HTML table do `document--parse_document` xuất ra — mỗi row có 4 cell: `STT | Cấp 1 | Cấp 2 | Tên`. Khi cell Cấp 1 có giá trị → mã mới cấp 1; cell Cấp 2 có giá trị → mã con của Cấp 1 gần nhất.
- Tên TK lấy `<b>` đầu tiên (header) làm tên chính; dòng phụ (cấp 2 không bold) là tên chi tiết.
- Việc phân loại `type` theo prefix 1–9 cứng trong parser; không phụ thuộc nội dung tên.
- Migration chạy bằng `supabase--migration`, sau khi user duyệt mới thực thi.

## Kiểm tra sau khi triển khai

- `SELECT COUNT(*) FROM chart_of_accounts` ≥ 180.
- Mở `/coa` thấy cây đầy đủ Loại 1 (TK 111–171), Loại 2 (211–244), Loại 3 (331–357), Loại 4 (411–421), Loại 5 (511–521), Loại 6 (611–642), Loại 7 (711), Loại 8 (811–821), Loại 9 (911).
- Mở `/reports` chọn B01 — không có warning "missing account".
- Build TS pass.
