## Bối cảnh

Hiện form **Tạo tổ chức mới** (`tenant-switcher.tsx`) đã dùng `TaxLookupResult` đầy đủ — tự điền 10+ trường từ MST. Nhưng với tổ chức **đã tồn tại**, ở `Cài đặt → Tổ chức` (`src/routes/_app/settings/index.tsx`), `TaxIdLookupInput` mới chỉ điền 3 trường (`tax_id`, `company_name`, `address`) và chỉ khi đang rỗng — nên user không có cách dễ dàng để bổ sung các trường còn thiếu (loại hình, GPKD, ngành nghề, đại diện pháp luật, …) — chính là các trường wizard `setup` đang báo bắt buộc.

## Mục tiêu

Thêm nút **"Cập nhật từ MST"** trong tab **Tổ chức** của Cài đặt. Khi bấm:
1. Tra cứu MST hiện tại (hoặc MST user vừa nhập trong ô).
2. Điền tất cả trường còn trống bằng dữ liệu mới từ API.
3. Hiển thị review (toast + dirty form) để user xem & bấm **Lưu** xác nhận.

## UX

Khu vực "Hồ sơ pháp lý" trong tab Tổ chức:

```text
Mã số thuế *           [____________] 🔍  [⟳ Cập nhật từ MST]
                        Nhấn để tự điền các trường còn trống.
```

- Nút `⟳ Cập nhật từ MST` đặt cạnh ô MST, chỉ hiện khi `canEdit` và `form.tax_id` không rỗng.
- Disabled khi đang loading hoặc MST không hợp lệ (10/13 số).
- Có 2 chế độ:
  - **Mặc định (chỉ điền trống)**: chỉ ghi đè các trường đang `null/""`. An toàn — không phá dữ liệu user đã chỉnh tay.
  - **Ghi đè tất cả** (checkbox trong popover/menu): điền cả khi đang có giá trị. Dùng khi user biết dữ liệu cũ sai.
- Sau khi điền: toast `"Đã điền N trường từ MST — bấm Lưu để xác nhận"`. Không tự save — giữ pattern dirty-form hiện tại.
- Trường được map: `company_name`, `trade_name`, `address`, `legal_rep_name`, `legal_form`, `business_reg_no`, `business_reg_date`, `established_date`, `industry_code`, `industry_name`, `tax_authority`, `phone`, `email`.

## Thay đổi kỹ thuật

**1. `src/routes/_app/settings/index.tsx` — `OrganizationTab`**

- Import `lookupTaxId` từ `@/lib/tax-lookup.functions` và dùng qua `useServerFn` + `useMutation`.
- Thêm state `overwriteAll: boolean` (mặc định `false`).
- Thêm hàm `applyLookup(r: TaxLookupResult)`:
  - Build mapping `{ company_name: r.name, trade_name: r.tradeName, address: r.address, legal_rep_name: r.director, legal_form: r.legalForm, business_reg_no: r.registrationNo, business_reg_date: r.registrationDate, established_date: r.establishedDate, industry_code: r.industryCode, industry_name: r.industryName, tax_authority: r.taxAuthority, phone: r.phone, email: r.email }`.
  - Với mỗi cặp: bỏ qua nếu value rỗng; nếu `overwriteAll` → ghi; ngược lại chỉ ghi khi `form[k]` đang rỗng.
  - Đếm số trường thay đổi → toast.
- Mutation `refetchMut`: gọi `lookupTaxId({ data: { taxId: form.tax_id } })`, `onSuccess` → `applyLookup`, `onError` → toast.
- Render: bên cạnh `TaxIdLookupInput`, thêm `<Button variant="outline" size="sm">⟳ Cập nhật từ MST</Button>` + một `DropdownMenu`/`Popover` nhỏ chứa checkbox `"Ghi đè dữ liệu hiện có"`.
- Cập nhật `onResolved` của `TaxIdLookupInput` để dùng cùng `applyLookup` (thay vì logic 3-trường hiện tại) — đồng nhất hành vi giữa "tra cứu khi gõ" và "nút cập nhật".

**2. Không đổi**

- `tax-lookup.functions.ts`, `tenants.functions.ts` (`updateActiveTenant` đã chấp nhận đủ field).
- `tenant-switcher.tsx` (form Tạo mới giữ nguyên).
- Schema / migrations / RLS.

## Phạm vi loại trừ

- Không tự động save (vẫn cần user bấm **Lưu**).
- Không thêm "lịch sử lookup" / audit log.
- Không đụng tới form Tạo mới ở tenant-switcher.
- Không sửa `setup` wizard.
