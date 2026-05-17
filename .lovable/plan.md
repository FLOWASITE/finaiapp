# Tích hợp API tra cứu MST xinvoice.vn

## Mục tiêu
Thêm nút **"Tra cứu"** cạnh ô MST trong 3 form: NCC, Khách hàng, Cài đặt Tổ chức. Khi bấm → gọi API xinvoice.vn → tự điền tên + địa chỉ.

## Các bước

### 1. Secrets
Yêu cầu user nhập 2 secrets toàn hệ thống qua `add_secret`:
- `XINVOICE_CLIENT_ID`
- `XINVOICE_API_KEY`

### 2. Server function `lookupTaxId` (`src/lib/tax-lookup.functions.ts`)
- `createServerFn({ method: "POST" })` + `requireSupabaseAuth` (chỉ user đã đăng nhập mới gọi được, tránh lạm dụng quota).
- Input: `{ taxCode: string }` — Zod validate `min(10).max(14).regex(/^[0-9-]+$/)`.
- Gọi `GET https://api.xinvoice.vn/gdt-api/tax-payer/{taxCode}` với headers `client-id`, `api-key` (đọc từ `process.env` trong handler).
- Map response → DTO an toàn: `{ taxID, name, address, orgType, taxDepartment, status }`.
- Xử lý lỗi: 404 → "Không tìm thấy MST"; 401/403 → "Sai cấu hình API"; khác → throw message gọn.

### 3. Component dùng chung `<TaxIdLookupInput />` (`src/components/tax-id-lookup-input.tsx`)
- Props: `value`, `onChange(taxId)`, `onResolved({ name, address, ... })`, `placeholder`, `disabled`.
- Layout: `<Input>` + nút **"Tra cứu"** (icon `Search`, loading state).
- Click → `useMutation` gọi `lookupTaxId` → callback `onResolved` để form cha tự điền các trường liên quan + `toast` báo kết quả.

### 4. Wire vào 3 form
- **`src/routes/_app/suppliers/index.tsx`** (dialog Thêm/Sửa NCC): thay Input MST hiện tại bằng `<TaxIdLookupInput>`. `onResolved` → setEditing({ ...editing, name, address }) nếu các ô đó đang trống (không ghi đè dữ liệu user đã nhập).
- **Form Khách hàng**: tìm file tương ứng (`src/routes/_app/...customers...` hoặc trong sales). Áp dụng tương tự. *(Sẽ xác nhận file chính xác lúc thực hiện.)*
- **`src/routes/_app/settings/index.tsx`** tab Tổ chức: ô `tax_id` thay bằng `<TaxIdLookupInput>`, `onResolved` → điền `company_name`, `address` nếu trống.

### 5. UX nhỏ
- Disable nút khi MST chưa đủ độ dài.
- Toast success: "Đã lấy thông tin: {name}"; toast error: thông báo gọn.

## Chi tiết kỹ thuật
- API endpoint: `https://api.xinvoice.vn/gdt-api/tax-payer/:taxCode` (GET, 2 header xác thực).
- Không expose key ra client — luôn proxy qua server function.
- Không cache server-side (đơn giản hoá; mỗi click là 1 request).

## Ngoài phạm vi
- Không tạo bảng lưu lịch sử tra cứu.
- Không tra cứu hàng loạt.
- Không thay đổi RLS hay schema DB.
