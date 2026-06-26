## Mục tiêu
Trên màn **Phiếu bán hàng** (`src/routes/_app/sales/vouchers.tsx`), đổi ô **Thuế GTGT(%)** ở từng dòng từ Input số sang **Select** chọn loại thuế GTGT theo chuẩn VN.

## Các loại thuế trong select
Lấy từ `src/lib/vat-codes.ts` (đã có sẵn):
- `0%` — Xuất khẩu, vận tải QT
- `5%`
- `8%` — Giảm thuế
- `10%` — Thông thường (mặc định)
- `KCT` — Không chịu thuế (rate 0, không tính VAT)
- `KKKNT` — Không kê khai, không nộp (rate 0, không tính VAT)

## Thay đổi
1. **`src/routes/_app/sales/vouchers.tsx`**
   - Import `Select, SelectTrigger, SelectValue, SelectContent, SelectItem` và `VAT_CODES, vatRate, vatHasOutputTax` từ `@/lib/vat-codes`.
   - Thêm field `vat_code` vào type `Line` (default `"10"`); giữ `vat_rate` để các phép tính/lưu DB hiện tại không vỡ.
   - Tại cell "Thuế GTGT(%)" (dòng ~1803–1812): thay `<Input type="number">` bằng `<Select>` hiển thị label ngắn (vd "10%", "KCT"). 
   - Khi chọn: cập nhật cả `vat_code` và `vat_rate` (KCT/KKKNT → `vat_rate = 0`); hàm `recompute` hiện đã tính `vat_amount` từ `vat_rate` nên tự động ra 0 cho 2 mã không thuế.
   - Mở rộng cột header sang `w-[110px]` để chứa select gọn.
   - Khi load phiếu cũ chưa có `vat_code`: suy ra từ `vat_rate` (10→"10", 8→"8", 5→"5", 0→"0", còn lại "10").

2. Không đổi schema DB, không đổi `sales-vouchers.functions.ts` — chỉ tinh chỉnh UI dòng phiếu.

## Phạm vi không động đến
- Cột "TK thuế GTGT" giữ nguyên.
- Phiếu mua hàng (`purchases/vouchers.tsx`) — chỉ áp dụng cho Phiếu bán hàng theo yêu cầu.
