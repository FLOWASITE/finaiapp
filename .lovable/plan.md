# Tra cứu MST — vietqr.io + thongtindoanhnghiep.co (fallback)

## Mục tiêu
Nút **"Tra cứu"** cạnh ô MST trong 3 form (NCC, Khách hàng, Cài đặt Tổ chức) → gọi server function → tự điền tên + địa chỉ. Không cần API key.

## Các bước

### 1. Server function `lookupTaxId` (`src/lib/tax-lookup.functions.ts`)
- `createServerFn({ method: "POST" })` + `requireSupabaseAuth` (chống lạm dụng).
- Input Zod: `{ taxCode: z.string().trim().min(10).max(14).regex(/^[0-9-]+$/) }`.
- Logic fallback:
  1. **Thử vietqr.io**: `GET https://api.vietqr.io/v2/business/{taxCode}` (10s timeout).
     - Nếu `data.code === "00"` → map `{ name: data.data.name, address: data.data.address, shortName: data.data.shortName, taxId: data.data.id, source: "vietqr" }`.
  2. **Fallback thongtindoanhnghiep.co**: `GET https://thongtindoanhnghiep.co/api/company/{taxCode}` (10s timeout).
     - Nếu có `Title` → map `{ name: Title, address: DiaChiCongTy, shortName: TitleEn, taxId: MaSoThue, director: GiamDocCongTy, source: "ttdn" }`.
  3. Cả 2 fail → throw `"Không tìm thấy MST {taxCode}"`.
- Trả DTO an toàn (không leak raw response).

### 2. Component dùng chung `<TaxIdLookupInput />` (`src/components/tax-id-lookup-input.tsx`)
- Props: `value`, `onChange(taxId)`, `onResolved(data)`, `placeholder`, `disabled`.
- Layout: `<Input>` 1 hàng + nút icon `Search` (loading spinner khi gọi).
- `useMutation` → `lookupTaxId({ data: { taxCode: value } })`:
  - success → `toast.success("Đã lấy: {name}")` + `onResolved(data)`.
  - error → `toast.error(message)`.
- Disable nút khi `value.replace(/-/g,'').length < 10`.

### 3. Wire vào 3 form (chỉ thay ô MST, không sửa logic khác)
- **`src/routes/_app/suppliers/index.tsx`** (dialog NCC):
  `onResolved` → `setEditing(p => ({...p, name: p.name || data.name, address: p.address || data.address }))`.
- **Form khách hàng**: xác định file (khả năng cao trong `src/routes/_app/sales/...` hoặc tạo riêng nếu chưa có). Nếu không có form khách hàng độc lập, skip phần này và báo cho user.
- **`src/routes/_app/settings/index.tsx`** tab Tổ chức: `onResolved` → điền `company_name`, `address` nếu trống.

## Chi tiết kỹ thuật
- Cả 2 API public, không key, gọi server-side → tránh CORS.
- `AbortController` cho timeout 10s mỗi nguồn.
- Không cache (đơn giản).

## Ngoài phạm vi
- Không tạo bảng cache lịch sử.
- Không thay đổi RLS / schema.
- Không tra cứu hàng loạt.
