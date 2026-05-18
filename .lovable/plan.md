## Mục tiêu

Hoàn thiện form "Tạo tổ chức mới" trong `TenantSwitcher` để khi nhập **Mã số thuế** thì hệ thống tự động tra cứu (qua `lookupTaxId` đã có) và điền sẵn các thông tin doanh nghiệp, giảm thao tác thủ công.

## Thay đổi

### 1. `src/components/tenant-switcher.tsx` — `CreateTenantDialog`

Bố cục mới của dialog (theo thứ tự nhập tự nhiên):

- **Mã số thuế** — dùng component `TaxIdLookupInput` (đã có sẵn). Người dùng nhập MST rồi bấm nút tra cứu; khi có kết quả:
  - `company_name` ← `result.name`
  - `name` (tên hiển thị) ← `result.shortName ?? result.name` (chỉ tự điền khi field còn trống, không ghi đè nếu user đã sửa)
  - `address` ← `result.address`
  - `legal_rep_name` ← `result.director` (nếu có)
  - Hiện toast "Đã lấy thông tin từ MST".
- **Tên pháp nhân** (`company_name`) — input text, bắt buộc sau khi tra cứu.
- **Tên hiển thị** (`name`) — input text, bắt buộc, mặc định bằng tên pháp nhân.
- **Địa chỉ trụ sở** (`address`) — textarea, tuỳ chọn.
- **Đại diện pháp luật** (`legal_rep_name`) — input text, tuỳ chọn.
- **Chuẩn kế toán** — Select `TT133` / `TT200`, mặc định `TT133`.
- **Đồng tiền hạch toán** — Select đơn giản với `VND` (mặc định) và `USD`.

Nút **Tạo** chỉ enable khi có `name` và `company_name` (giảm trường hợp tạo tổ chức rỗng). Reset state khi đóng dialog.

### 2. `src/lib/tenants.functions.ts` — mở rộng `createTenant`

Thêm các field tuỳ chọn vào `CreateTenantSchema` và payload insert vào bảng `tenants`:

- `address` (string, max 500, optional)
- `legal_rep_name` (string, max 255, optional)
- `accounting_standard` đã có; thêm hỗ trợ truyền `base_currency` (đã có).

Logic insert giữ nguyên (admin client, tạo `tenant_members` owner, set `active_tenant_id`).

## Phạm vi không thay đổi

- Không động vào `lookupTaxId`, không thêm bảng / migration mới.
- Không sửa luồng auth, không sửa các route khác.
- Các trường khác trong "Hoàn tất thiết lập" (loại hình DN, GPKD, kỳ kê khai, v.v.) vẫn nhập sau ở trang `/settings` qua `updateActiveTenant` như hiện tại — dialog này chỉ tập trung khởi tạo nhanh.

## Kỹ thuật

- Tận dụng `TaxIdLookupInput` (đã có cache 24h client + server) → không phát sinh code tra cứu mới.
- `onResolved` callback nhận `TaxLookupResult` để fill form; dùng cờ `userEditedName` để tránh ghi đè khi user đã chỉnh.
- Validate phía server bằng Zod (đã có pattern); phía client chỉ disable nút submit khi thiếu trường bắt buộc.
