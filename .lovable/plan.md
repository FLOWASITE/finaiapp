## Mục tiêu
Tinh giản & sửa form **Cập nhật tổ chức** (`/settings`) theo 6 yêu cầu.

## Thay đổi UI — `src/routes/_app/settings/index.tsx`

1. **Bỏ "Địa chỉ xuất hoá đơn"** — gỡ `Field` `billing_address` (mục Liên hệ & Địa chỉ). Khi lưu, set `billing_address = null`.
2. **Bỏ GPKD/ĐKKD** — gỡ 3 `Field`: `business_reg_no`, `business_reg_date`, `business_reg_place`. Cũng gỡ chữ "GPKD" trong dòng `Hint` "Tự điền…".
3. **Auto-fill Loại hình doanh nghiệp từ Tên pháp nhân** — thêm helper `inferLegalForm(companyName)`:
   - `TNHH` → `llc`
   - `CỔ PHẦN` / `CP` → `jsc`
   - `HỢP DANH` → `partnership`
   - `DOANH NGHIỆP TƯ NHÂN` / `DNTN` → `sole_prop`
   - `HỘ KINH DOANH` / `HKD` → `household`
   - `CHI NHÁNH` → `branch`
   
   Gắn vào `onChange` của `company_name`: nếu `legal_form` đang trống hoặc người dùng chưa chỉnh tay (track bằng `userEditedLegalFormRef`), tự set giá trị suy luận. Vẫn cho phép sửa tay.
4. **Bỏ Fax** — gỡ `Field` `fax`. Khi lưu, set `fax = null`. Layout dòng Điện thoại/Email/Website sẽ rearrange gọn lại (Điện thoại + Email trên 1 hàng, Website xuống dưới hoặc cùng hàng tuỳ chỗ trống).
5. **TT200 → TT99** — trong dropdown "Chuẩn kế toán áp dụng":
   - Đổi `<SelectItem value="TT200">` thành `value="TT99"` label `"TT 99/2025/TT-BTC — Áp dụng đầy đủ"`.
   - Giữ `TT133` như cũ.
   - Nếu dữ liệu hiện tại là `TT200`, hiển thị thêm option ẩn để không vỡ select; có thể auto-migrate trong loader (hiển thị TT99 thay vì TT200) — xem mục Backend.
6. **Ngành nghề kinh doanh — chọn nhiều** — thay `IndustryCombobox` đơn lẻ bằng phiên bản multi-select.

## Thay đổi component — `src/components/industry-combobox.tsx`
Thêm chế độ multi: prop `multi?: boolean`, `codes?: string[]`, `names?: string[]`, `onChangeMulti?: (items: {code,name}[]) => void`. Trong popover hiển thị `Checkbox` thay vì `Check`, hiển thị các chip đã chọn bên ngoài + nút xoá. Giữ tương thích chế độ đơn cũ.

## Backend — schema & validator

**Migration (`supabase--migration`)**:
```sql
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS industries jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Backfill từ industry_code/industry_name hiện có
UPDATE public.tenants
SET industries = jsonb_build_array(jsonb_build_object('code', industry_code, 'name', industry_name))
WHERE industries = '[]'::jsonb AND industry_code IS NOT NULL;
```
Giữ `industry_code`/`industry_name` (lưu ngành **đầu tiên** = ngành chính) để backward-compat với invoice/print/legacy code.

**`src/lib/tenants.functions.ts`** (`updateTenant` validator + `createTenant`):
- Thêm `industries: z.array(z.object({ code: z.string(), name: z.string() })).max(20).optional()`.
- Khi `industries` được gửi: tự set `industry_code = industries[0]?.code`, `industry_name = industries[0]?.name` để đồng bộ.
- Validator `accounting_standard`: nới thành `z.enum(["TT133","TT200","TT99"])` (giữ TT200 cho dữ liệu cũ, mặc định mới là TT99).
- Cho phép payload set `billing_address=null`, `fax=null` (chỉ cần `.nullable().optional()` — kiểm tra, có thể đã sẵn).

**`src/lib/tenant-setup-fields.ts`**: gỡ `business_reg_no`, `business_reg_date` khỏi `REQUIRED_TENANT_FIELDS` (vì không còn nhập). Setup progress sẽ tính lại tự động.

## Nơi khác cần đồng bộ (nhẹ)
- `src/components/tenant-switcher.tsx` (dialog tạo nhanh): bỏ hiển thị "GPKD/MST", "Ngày cấp" trong bonus list (giữ payload gửi server vẫn được; chỉ ẩn UI). Không bắt buộc trong vòng này nếu user chỉ cần sửa trang Settings — sẽ confirm.
- `src/routes/_app/setup.tsx` / wizard: nếu có bước nhập GPKD, gỡ tương tự. (Nếu chưa cần thiết, có thể làm follow-up.)

## Không đụng
- AI memory, in hoá đơn, BCTC (tiếp tục đọc `industry_code`/`industry_name` là ngành chính).
- Bảng `tenants` không drop column nào (an toàn dữ liệu cũ).

## Kiểm thử nhanh
1. Mở `/settings` → tab Tổ chức: các field bị gỡ biến mất, không lỗi console.
2. Gõ "CÔNG TY CỔ PHẦN ABC" vào Tên pháp nhân → Loại hình tự nhảy "Cổ phần"; sửa tay sang "TNHH" → không bị ghi đè lại.
3. Chuẩn kế toán: dropdown chỉ còn TT133 + TT99; tổ chức cũ đang TT200 vẫn hiển thị (label fallback).
4. Ngành nghề: chọn 3 ngành → Lưu → reload → vẫn còn 3 ngành; ngành đầu là ngành chính.
5. Setup progress (% hoàn thiện) tăng vì bớt 2 field bắt buộc.
