# Bộ lọc thời gian dùng chung

## Mục tiêu
Tạo 1 component `<DateRangeFilter />` thống nhất như ảnh đính kèm:
- Combobox **Khung thời gian** với preset (mặc định "Năm này").
- 2 ô **Từ ngày / Đến ngày** tự động cập nhật theo preset, vẫn cho phép sửa tay (chuyển sang "Tùy chọn").
- Nút "Lọc" (icon search) để trigger refetch.
- Hiển thị badge tóm tắt "Từ dd/MM/yyyy đến dd/MM/yyyy" có thể click để mở lại bộ lọc (popover).

Áp dụng cho **mọi màn hình hiện có filter ngày**:
- `/sales`, `/invoices` (Mua hàng), `/cash`, `/bank`, `/journal`
- `/payables`, `/receivables`
- `/reports` (BCTC), `/reports/ledgers` (Sổ sách), `/tax` (Báo cáo thuế)
- `/payroll`, `/inventory` (nếu có cột ngày)

## Preset
| Label | from | to |
|---|---|---|
| Hôm nay | today | today |
| Hôm qua | today-1 | today-1 |
| Tuần này | thứ 2 tuần này | CN tuần này |
| Tuần trước | thứ 2 tuần trước | CN tuần trước |
| Tháng này | ngày 1 tháng này | cuối tháng này |
| Tháng trước | ngày 1 tháng trước | cuối tháng trước |
| Quý này | đầu quý | cuối quý |
| Quý trước | đầu quý trước | cuối quý trước |
| **Năm này** *(mặc định)* | 01/01/yyyy | 31/12/yyyy |
| Năm trước | 01/01/yyyy-1 | 31/12/yyyy-1 |
| Tháng 1 → Tháng 12 | đầu tháng N năm hiện tại | cuối tháng N |
| Tùy chọn | giữ nguyên user input | giữ nguyên |

## Cấu trúc kỹ thuật

### File mới
- `src/lib/date-presets.ts` — pure helpers:
  - `type PresetKey = "today"|"yesterday"|"thisWeek"|...|"custom"`
  - `getPresetRange(key, refDate=now): { from: string; to: string }` (ISO `yyyy-MM-dd`).
  - `detectPreset(from, to): PresetKey` — auto chọn preset khi from/to khớp một range chuẩn, ngược lại trả `"custom"`.
  - `formatVN(iso): string` → `dd/MM/yyyy`.
- `src/components/date-range-filter.tsx`:
  ```tsx
  type Props = {
    from: string; to: string;
    onChange: (range: { from: string; to: string }) => void;
    defaultPreset?: PresetKey; // "thisYear"
    compact?: boolean; // hiển thị dạng badge + popover (như ảnh) hay inline
    className?: string;
  };
  ```
  - Dùng `Popover` + `Select` (đã có sẵn shadcn) + `Input type="date"`.
  - Style theo design system (`bg-card`, `border-border`, primary xanh lá hiện hữu).
  - Khi user đổi preset → tự set from/to → gọi `onChange`.
  - Khi user sửa input ngày → preset tự nhảy sang "Tùy chọn".

### Refactor màn hình
Mỗi route hiện có 2 ô date riêng:
```tsx
// trước
<Input type="date" value={from} ... />
<Input type="date" value={to} ... />

// sau
<DateRangeFilter from={from} to={to} onChange={(r) => { setFrom(r.from); setTo(r.to); }} />
```
Giữ nguyên state `from`/`to` và queryKey để không phá logic backend.

### Áp dụng từng màn hình
1. `src/routes/_app/reports/ledgers.tsx` — thay block dòng 53-60.
2. `src/routes/_app/reports/index.tsx` — thay date inputs ở period filter (giữ tính năng so sánh kỳ).
3. `src/routes/_app/tax/index.tsx` — thay 2 input date.
4. `src/routes/_app/cash/index.tsx`, `bank.tsx`, `journal.tsx`.
5. `src/routes/_app/sales/index.tsx`, `invoices/index.tsx`, `payables/index.tsx`, `receivables/index.tsx`.
6. `payroll/index.tsx`, `inventory/index.tsx` — chỉ thêm nếu hiện đang lọc theo ngày; nếu chưa thì thêm filter mới với preset mặc định "Năm này".

### Mặc định khi mount
- Mọi màn hình mặc định `defaultPreset="thisYear"` → from=01/01/năm hiện tại, to=31/12/năm hiện tại (khớp với hành vi hiện tại của reports & ledgers).
- Riêng `cash` đang dùng "tháng này" → đổi sang "thisYear" để đồng bộ (hoặc cho phép override qua prop nếu user muốn).

## Không thay đổi
- Không động vào server functions, query keys, hay schema database.
- Không đổi cấu trúc routing.
- Giữ Excel/PDF/print export như cũ.

## Câu hỏi nhanh
1. Mặc định khắp app dùng **"Năm này"** đúng không, hay muốn smart-default theo từng màn (vd cash → "Tháng này", reports → "Năm này")?
2. Có cần nút **"Lọc"** (icon search) như ảnh hay refetch tự động khi đổi ngày? (Hiện codebase đang auto-refetch theo queryKey.)
