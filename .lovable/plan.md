## Mục tiêu

Nâng cấp "Khai báo Tổ chức" theo chuẩn Xero / QuickBooks / MISA / Fast:
hồ sơ pháp lý đầy đủ, dữ liệu nhập 1 lần dùng xuyên suốt hệ thống (hoá đơn,
BCTC, kê khai thuế). Bắt buộc đầy đủ + auto-fill từ MST.

## 1. Mở rộng schema `tenants`

Thêm các cột (đều nullable, không phá dữ liệu cũ):

**Hồ sơ pháp lý**
- `trade_name` — tên giao dịch (khác tên pháp nhân)
- `legal_form` — enum: `llc` (TNHH), `jsc` (CP), `partnership` (Hợp danh),
  `sole_prop` (DNTN), `household` (HKD), `branch` (Chi nhánh), `other`
- `business_reg_no` — số GPKD/ĐKKD
- `business_reg_date` — ngày cấp
- `business_reg_place` — nơi cấp (Sở KH-ĐT…)
- `established_date` — ngày thành lập
- `industry_code` — mã ngành VSIC chính (vd "6920")
- `industry_name` — tên ngành chính

**Thuế**
- `tax_authority` — chi cục thuế quản lý
- `tax_method` — enum: `deduction` (khấu trừ) / `direct_revenue` /
  `direct_gtgt` (trực tiếp trên GTGT)
- `vat_period` — enum: `monthly` / `quarterly`
- `pit_method` — enum: `monthly` / `quarterly`

**Liên hệ mở rộng**
- `email`, `website`, `fax`
- `billing_address`, `shipping_address` (toggle "giống trụ sở")

**Đại diện chi tiết** (mở rộng từ 3 cột tên đã có)
- `legal_rep_title` — chức danh (Giám đốc / Tổng giám đốc…)
- `legal_rep_id_no` — CCCD/CMND
- `legal_rep_id_date` — ngày cấp
- `legal_rep_phone`
- `chief_accountant_cert_no` — số chứng chỉ hành nghề kế toán

**Trạng thái khai báo**
- `setup_completed` — boolean, default false
- `setup_completed_at` — timestamp

CHECK constraints cho enum, validation trigger cho ngày (không tương lai
cho `established_date`, `business_reg_date`).

## 2. Server functions (`src/lib/tenants.functions.ts`)

- Mở rộng `UpdateTenantSchema` (Zod) với mọi field mới — `max/min`, regex
  cho mã ngành 4-6 số, format ngày, format CCCD 9/12 số.
- Hàm mới `completeTenantSetup(data)` — validate đầy đủ trường cốt lõi
  rồi set `setup_completed=true`, `setup_completed_at=now()`.
- Hàm mới `getSetupProgress()` — trả `{percent, missing[]}` cho thanh tiến độ.
- Mở rộng `getActiveTenant` trả thêm field mới + `setup_completed`.

## 3. UI flow

### A. Setup Wizard `/_app/setup` (tenant mới hoặc `setup_completed=false`)

Layout: header steps progress + body card + footer Back/Next. 5 bước:

1. **Pháp lý cơ bản** — MST (TaxIdLookupInput auto-fill), Tên pháp nhân,
   Tên giao dịch, Loại hình DN, GPKD số/ngày/nơi cấp, Ngày thành lập, Mã
   ngành (combobox tra cứu VSIC top 20 + nhập tay).
2. **Liên hệ & địa chỉ** — Địa chỉ trụ sở, Email, ĐT, Website, Fax;
   toggle billing/shipping khác trụ sở.
3. **Cấu hình tài chính** — Chuẩn kế toán (TT133/TT200), Đồng tiền hạch
   toán, Tháng bắt đầu năm tài chính, PP tính thuế GTGT, Kỳ kê khai
   GTGT/TNCN, Chi cục thuế.
4. **Người ký BCTC** — Đại diện pháp luật (tên, chức danh, CCCD + ngày
   cấp, ĐT), Kế toán trưởng (tên, số chứng chỉ), Người lập biểu.
5. **Thương hiệu** — Logo, chữ ký, con dấu (CompactImageRow).

Sau bước 5: nút "Hoàn tất khai báo" gọi `completeTenantSetup`, redirect
`/dashboard`. Cho phép "Bỏ qua, hoàn tất sau" — set `setup_completed=false`
và đi tiếp; sidebar hiện badge nhắc.

Route guard: nếu `setup_completed=false` và đường dẫn ≠ `/setup`/`/settings`,
hiện banner mềm "Hoàn tất khai báo tổ chức" với link, KHÔNG ép redirect
(tránh chặn user khám phá).

### B. Edit form `/_app/settings` (long-form + side-nav, Xero style)

Cấu trúc tab Tổ chức:

```text
┌─────────────────┬───────────────────────────────────┐
│ ▸ Pháp lý       │  [Card] Hồ sơ pháp lý             │
│ ▸ Liên hệ       │   ...                             │
│ ▸ Tài chính     │  [Card] Liên hệ & Địa chỉ         │
│ ▸ Người ký      │   ...                             │
│ ▸ Thương hiệu   │  [Card] Cấu hình tài chính        │
│ ▸ Tiến độ 85%   │   ...                             │
└─────────────────┴───────────────────────────────────┘
                            [sticky save bar]
```

- Side-nav sticky bên trái (lg breakpoint), mobile thu thành tab cuộn ngang.
- Mỗi mục là `<section id="...">` để anchor scroll mượt, highlight active
  bằng IntersectionObserver.
- Thanh tiến độ hồ sơ ở cuối side-nav (vd 85% — 3 trường còn thiếu).
- Sticky save bar giữ nguyên design hiện tại.

## 4. Component mới

- `src/components/legal-form-select.tsx` — Select với 7 loại hình DN.
- `src/components/industry-combobox.tsx` — combobox tra cứu mã ngành VSIC
  (data top 50 ngành phổ biến hard-code trong `src/lib/vsic.ts`, kèm input
  tay nếu không có).
- `src/components/setup-stepper.tsx` — UI bước cho wizard.
- `src/components/settings-section-nav.tsx` — side-nav anchor + scrollspy.
- Tái dùng: `TaxIdLookupInput`, `CompactImageRow`, `Input/Select`.

## 5. Auto-fill từ MST

Mở rộng `taxLookup` đã có để map đầy đủ vào form:
- `name` → company_name
- `address` → address
- `taxId` → tax_id
- Nếu API trả `legal_rep`/`industry` → điền tương ứng (chỉ khi field đang trống).

## 6. Validation

- Client (Zod + react-hook-form): MST 10/13 số, ngày không tương lai,
  email, website URL, CCCD 9/12 số, mã ngành 4-6 chữ số.
- Server (Zod): cùng schema, là nguồn chân lý.
- Mỗi bước wizard chỉ validate trường thuộc bước đó trước khi Next.
- `completeTenantSetup` validate full schema "required cốt lõi": MST,
  tên pháp nhân, loại hình, GPKD số + ngày, địa chỉ, chuẩn kế toán, đồng
  tiền, năm tài chính, đại diện pháp luật (tên + chức danh).

## 7. Cập nhật điểm khác

- Sidebar: badge cảnh báo "Khai báo chưa đủ" khi `setup_completed=false`.
- Tenant switcher: hiển thị tên giao dịch (`trade_name`) nếu có, fallback
  `company_name` → `name`.
- Hoá đơn / BCTC: kéo legal_rep_title, chief_accountant_cert_no, GPKD…
  vào template in.

## Phân chia file thực hiện

- `supabase/migrations/...` — ALTER TABLE tenants + CHECK + trigger.
- `src/lib/tenants.functions.ts` — mở rộng schema, thêm
  `completeTenantSetup`, `getSetupProgress`.
- `src/lib/vsic.ts` — danh mục mã ngành (mới).
- `src/components/legal-form-select.tsx`, `industry-combobox.tsx`,
  `setup-stepper.tsx`, `settings-section-nav.tsx` (mới).
- `src/routes/_app/setup.tsx` (mới) — wizard 5 bước.
- `src/routes/_app/settings/index.tsx` — viết lại OrganizationTab theo
  long-form + side-nav.
- `src/components/tenant-switcher.tsx` — ưu tiên `trade_name`.
- `src/components/app-sidebar.tsx` — badge cảnh báo setup chưa đủ.

## Ngoài phạm vi lần này

- Khu vực & định dạng (timezone, locale, decimal): để lần sau.
- Multi-branch (nhiều chi nhánh dưới 1 tổ chức): cần schema riêng.
- Import VSIC đầy đủ ~600 mã: tạm dùng top 50.
