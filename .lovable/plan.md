Sửa `src/components/catalog/ItemCreateDialog.tsx` (chỉ UI, không đụng business logic khác).

## 1. Bỏ ô "Tên tiếng Anh"
- Xoá field `nameEn` khỏi schema, DEFAULT, JSX và payload.
- Lưới "Thông tin chung" còn 1 cột cho "Nhóm danh mục" (hoặc đặt Tên + Nhóm cùng hàng).

## 2. Nút chọn Dịch vụ / Hàng hóa nổi bật
- Thay Select "Phân loại" (đang nằm trong section Hạch toán) bằng cặp nút radio lớn ngay đầu form, dưới "Tên mặt hàng":
  - `[ Dịch vụ ]  [ Hàng hóa ]` (ToggleGroup, mặc định = Dịch vụ).
- Khi đổi sẽ tự reset:
  - `defaultAccount*` theo bảng ở mục 5
  - `amortization`: Dịch vụ → `expense_immediately`, Hàng hóa → giữ
  - Ẩn lựa chọn "Hỗn hợp" (không dùng nữa trong form nhanh).

## 3. Nhóm danh mục — chỉ hiện khi là Dịch vụ + thêm "Khác"
- Khối "Nhóm danh mục" chỉ render khi `itemType === "service"`.
- Thêm option `{ code: "OTHER", nameVi: "Khác…" }` vào cuối dropdown. Khi chọn "Khác", hiện thêm `<Input>` để gõ tên nhóm tự do; giá trị lưu vào `category` dưới dạng chuỗi tự do (đã được `z.string()` chấp nhận).
- Với Hàng hóa: bỏ chọn nhóm danh mục (không bắt buộc), `category` set `"GOODS"`.

## 4. TK mặc định theo chế độ kế toán của tổ chức
- Lấy chế độ qua server fn đã có: `getActiveCoaCircular` (`src/lib/coa.functions.ts`) → `effective: "TT99" | "TT133"`.
- Dùng `useServerFn` + `useQuery(["coa-circular"])` ngay khi mở dialog.
- Chỉ render **một** ô "Tài khoản mặc định" tương ứng:
  - regime TT133 → nhập/sửa `defaultAccountTT133`, ô TT99 ẩn (vẫn copy cùng giá trị để payload không vỡ).
  - regime TT99 → nhập/sửa `defaultAccountTT99`, ô TT133 ẩn (vẫn copy).
- Label hiển thị: "Tài khoản mặc định (TT 99)" hoặc "(TT 133)".

## 5. Preset TK mặc định theo Loại × Chế độ
Khi đổi `itemType` hoặc khi dialog mở (regime đã load), tự điền + cung cấp dropdown gợi ý:

| Loại | TT 133 | TT 99 |
|---|---|---|
| Dịch vụ | 6421, 6422, 632 | 6417, 6427, 6277, 632 |
| Hàng hóa | 156, 152, 153, 242, 211, 213 | 156, 152, 153, 242, 211, 213 |

- Default khi chọn Dịch vụ: TT133 → `6422`, TT99 → `6427`.
- Default khi chọn Hàng hóa: `156` cho cả hai.
- "Loại hạch toán (gợi ý nhanh)" bây giờ chỉ render khi Hàng hóa (preset 156/152/153/242/211/213). Khi Dịch vụ thay bằng preset 4 mã ở trên theo regime.
- Cập nhật `ACCOUNT_PRESETS` thành 2 mảng riêng: `GOODS_PRESETS` (chung TT99/TT133) và `SERVICE_PRESETS_TT99` / `SERVICE_PRESETS_TT133`.

## 6. Dọn dẹp phụ
- Validation `defaultAccountTT99/TT133` vẫn regex `^[0-9]{3,4}$` (đã đủ cho 6417/6427/6277).
- Không đổi `upsertCatalogItem` server fn — payload vẫn truyền cả 2 field; field không hiển thị sẽ mirror field hiển thị.
- Section "Phân loại" cũ trong "Hạch toán" xoá (đã chuyển lên đầu form).

## Phạm vi file
- `src/components/catalog/ItemCreateDialog.tsx` — sửa duy nhất file này.
- Không migration, không sửa schema DB, không đụng `ProductPickerCell` hay `catalog.functions.ts`.