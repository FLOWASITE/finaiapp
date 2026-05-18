## Mục tiêu

Mở rộng `lookupTaxId` để khai thác thêm các trường mà API MST (đặc biệt `thongtindoanhnghiep.co`) trả về, rồi auto-fill **toàn bộ** thông tin pháp lý của tổ chức khi tạo mới — giảm thao tác nhập tay ở `/settings`.

## Hiện trạng

`TaxLookupResult` hiện chỉ có: `taxId`, `name`, `shortName`, `address`, `director`. Form `CreateTenantDialog` chỉ điền 4 ô (tên pháp nhân, tên hiển thị, địa chỉ, đại diện).

Bảng `tenants` còn nhiều cột pháp lý quan trọng đang để trống: `business_reg_no`, `business_reg_date`, `established_date`, `tax_authority`, `legal_form`, `industry_code`, `industry_name`, `phone`, `email`, `trade_name`.

## Thay đổi

### 1. `src/lib/tax-lookup.functions.ts` — mở rộng kết quả

Bổ sung field vào `TaxLookupResult`:

```ts
type TaxLookupResult = {
  taxId, name, shortName, address, director,         // (đã có)
  tradeName?: string | null;          // TitleEn / tên giao dịch
  phone?: string | null;              // DienThoai
  email?: string | null;              // Email
  taxAuthority?: string | null;       // NoiDangKyQuanLy.Title
  taxAuthorityCode?: string | null;   // NoiDangKyQuanLy.Code
  registrationNo?: string | null;     // GiayPhepKinhDoanh hoặc MaSoThue
  registrationDate?: string | null;   // NgayCapGiayPhepKinhDoanh (YYYY-MM-DD)
  establishedDate?: string | null;    // NgayBatDauHopDong
  legalForm?: string | null;          // map từ LoaiHinhDN → enum tenants
  industryCode?: string | null;       // NganhNgheKinhDoanhChinh.MaNganhNghe
  industryName?: string | null;       // .TenNganhNghe
  provinceCode?: string | null;       // MaTinh
  source: "vietqr" | "ttdn";
};
```

`tryTTDN` đọc các field tương ứng từ response, map `LoaiHinhDN` (string) sang enum hợp lệ của cột `tenants.legal_form` (`llc`/`jsc`/`partnership`/`sole_prop`/`household`/`branch`/`other`) bằng heuristic theo từ khoá ("trách nhiệm hữu hạn" → `llc`, "cổ phần" → `jsc`, "hợp danh" → `partnership`, "tư nhân"/"cá nhân" → `sole_prop`, "hộ kinh doanh" → `household`, "chi nhánh" → `branch`, còn lại `other`). Date được chuẩn hoá ISO `YYYY-MM-DD`; bỏ qua nếu parse fail.

`tryVietQR` giữ nguyên (API này thông tin nghèo hơn).

Cache key & TTL không đổi — chỉ rộng thêm payload trong cache.

### 2. `src/lib/tenants.functions.ts` — nhận thêm field

Mở rộng `CreateTenantSchema` để optional nhận: `trade_name`, `phone`, `email`, `tax_authority`, `business_reg_no`, `business_reg_date` (date ISO), `established_date`, `legal_form` (enum như DB), `industry_code`, `industry_name`. Validate độ dài & enum khớp constraint DB. Insert thẳng vào `tenants` cùng các field hiện có.

Không thay đổi logic owner / membership / active tenant.

### 3. `src/components/tenant-switcher.tsx` — fill silent + show preview

Trong `CreateTenantDialog`:
- Lưu kết quả tra cứu vào state `lookup: TaxLookupResult | null`.
- Khi `onResolved`: ngoài 4 field hiện tại, lưu cả `lookup` để submit kèm.
- Hiển thị block **"Đã lấy từ MST"** (read-only, collapsible) liệt kê các field bonus đã có (loại hình, GPKD, ngày cấp, cơ quan thuế, ngành nghề, điện thoại, email) — giúp user biết phần lớn `/settings` đã được điền sẵn.
- Khi submit: gửi đủ payload tới `createTenant` (trim, bỏ field rỗng).
- Toast sau khi tạo: "Đã tạo tổ chức — đã tự điền N trường từ MST".

`createMut.mutationFn` type mở rộng tương ứng. Vẫn redirect `/settings` để user xác nhận/bổ sung những field còn thiếu (kỳ kê khai GTGT, chuẩn kế toán, v.v.).

## Phạm vi không thay đổi

- Không tạo bảng/migration mới (mọi cột đã tồn tại trong `tenants`).
- Không động vào `updateActiveTenant`, trang `/settings`, hay luồng auth.
- Không thay đổi cache strategy của tax-lookup.

## Kỹ thuật / lưu ý

- TTDN trả nhiều field tiếng Việt dạng `null`/empty string → chuẩn hoá về `null` để Zod `.optional()` ổn.
- Date validate bằng regex `\d{4}-\d{2}-\d{2}` rồi `new Date()`; nếu future date sẽ bị trigger `tenants_validate_dates` chặn → ở client/server bỏ qua date không hợp lệ thay vì lỗi insert.
- `legal_form` map sai sẽ vi phạm check constraint → fallback `other` để an toàn.
- VietQR response nghèo hơn TTDN → khi chỉ có VietQR vẫn fill được tên/địa chỉ như hiện tại; bonus fields rỗng.
