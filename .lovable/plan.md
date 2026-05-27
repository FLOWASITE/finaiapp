## Bối cảnh

- Tổ chức có cài đặt **Chế độ kế toán** (`tenants.accounting_standard` / `profiles.accounting_standard`) trong `/settings`.
- Chỉ còn **2 chế độ hợp lệ**: `TT99` (Thông tư 99/2025 — áp dụng đầy đủ) và `TT133` (Thông tư 133/2016 — DN nhỏ và vừa). **TT200 đã bị thay thế bởi TT99** — loại bỏ khỏi toàn bộ UI lựa chọn.
- Bảng `chart_of_accounts` hiện chỉ chứa danh mục **TT99** (167 dòng). Trang `/coa` luôn hiển thị TT99, không bám theo cài đặt của tổ chức.
- File Excel `he-thong-tai-khoan-ke-toan-tt-133.xlsx` (~110 TK) sẽ dùng để seed TT133.

## Mục tiêu

Trang `/coa` (và các nơi tra cứu COA) tự động hiển thị danh mục TK đúng với chế độ kế toán mà tổ chức đang chọn:
- `TT99` → bảng TK Thông tư 99/2025 (đã có).
- `TT133` → bảng TK Thông tư 133/2016 (bổ sung mới).
- Nếu còn dữ liệu cũ có `accounting_standard = 'TT200'` → tự động coi như `TT99` khi đọc (TT99 đã thay thế TT200), không hiển thị tuỳ chọn TT200 trên UI nữa.

## Thay đổi

### 1. Database (migration)
- Thêm cột `circular text not null default 'TT99'` vào `chart_of_accounts`.
- Đổi PK: drop PK trên `(code)`, tạo PK mới `(circular, code)` để cùng mã (vd 156) tồn tại ở cả 2 thông tư.
- Giữ FK hiện tại của `journal_lines.account_code` → tạo **partial unique index** `UNIQUE (code) WHERE circular = 'TT99'` để không phá ràng buộc nghiệp vụ.
- Insert ~110 dòng TT133 (cấp 1, cấp 2, cấp 3 như 33311/33312/33381/33382) với `circular = 'TT133'`.
- Data fix: `UPDATE tenants SET accounting_standard = 'TT99' WHERE accounting_standard = 'TT200'` (và tương tự cho `profiles`) — chuẩn hoá dữ liệu cũ.

### 2. Server function `listChartOfAccounts` (`src/lib/coa.functions.ts`)
- Đọc `accounting_standard` của tenant hiện tại.
- Map `TT200 → TT99` (an toàn cho dữ liệu cũ).
- Query `chart_of_accounts` filter theo `circular` tương ứng.
- Trả về thêm `effective_circular` để UI hiển thị label đúng.

### 3. UI Cài đặt (`src/routes/_app/settings/index.tsx`)
- Bỏ tuỳ chọn `TT200` trong Select "Chế độ kế toán" (kể cả nhánh điều kiện `form.accounting_standard === "TT200"` đang còn).
- Chỉ còn 2 mục:
  - `TT99` — "TT 99/2025 — Áp dụng đầy đủ"
  - `TT133` — "TT 133/2016 — DN nhỏ và vừa"
- Cập nhật schema Zod ở `src/lib/settings.functions.ts` và `src/lib/tenants.functions.ts`: `accounting_standard: z.enum(["TT99", "TT133"])` (bỏ `TT200`). Tại các nơi đọc giá trị từ DB, vẫn chấp nhận `TT200` cũ và quy về `TT99` để không vỡ runtime trước khi data fix chạy xong.
- Trang superadmin Organizations (`src/routes/_app/superadmin/organizations.tsx`): bỏ `<SelectItem value="TT200">`, đổi default `TT133` → giữ nguyên.

### 4. UI trang `/coa` (`src/routes/_app/coa/index.tsx`)
- Mô tả động theo `effective_circular`:
  - TT99 → "Danh mục TK theo Thông tư 99/2025/TT-BTC"
  - TT133 → "Danh mục TK theo Thông tư 133/2016/TT-BTC"
- Thêm dòng phụ nhỏ: "Đang dùng theo chế độ kế toán của tổ chức" + link "Đổi chế độ" dẫn về `/settings`.

## Không làm

- Không sửa logic định khoản AI / categorize (các nhánh TT200 vẫn còn trong code AI có thể giữ lại như fallback an toàn — sẽ dọn ở pass riêng).
- Không sửa danh mục mặc định trên phiếu mua/bán.
- `/coa` vẫn read-only — không CRUD trên TT133.

## Files sẽ đụng

- `supabase/migrations/<new>.sql` — thêm cột `circular`, đổi PK, partial unique index, seed TT133, normalize TT200→TT99.
- `src/lib/coa.functions.ts`
- `src/lib/settings.functions.ts`, `src/lib/tenants.functions.ts` — bỏ TT200 khỏi enum input.
- `src/routes/_app/settings/index.tsx` — bỏ option TT200.
- `src/routes/_app/superadmin/organizations.tsx` — bỏ option TT200.
- `src/routes/_app/coa/index.tsx` — label động + link.
