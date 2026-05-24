# Phiếu nhập/xuất kho có hệ số phiếu riêng

## Vấn đề
Hiện khi tạo phiếu kho từ phiếu bán/mua, hệ thống đặt số phiếu kho **bám theo số phiếu gốc**:
- `NK-{số phiếu mua}` (nhập kho từ phiếu mua)
- `XK-{số phiếu bán}` (xuất kho từ phiếu bán)

Trong khi đó, dự án đã có sẵn bộ sinh số phiếu kho riêng (`nextStockVoucherNo` trong `src/lib/inventory.functions.ts`) theo định dạng:
- Nhập kho: `PNK{YYYY}-00001` (auto +1, scope theo tenant)
- Xuất kho: `PXK{YYYY}-00001`

→ Bộ sinh đẹp này hiện chỉ dùng khi tạo phiếu kho thủ công, còn các luồng tạo tự động bị bỏ qua nên số phiếu kho không liên tục và lẫn lộn với số phiếu mua/bán.

## Giải pháp
Mọi nơi tạo `stock_vouchers` tự động đều dùng `nextStockVoucherNo` để cấp số theo hệ riêng `PNK/PXK`. Vẫn tôn trọng `stock_voucher_no` nếu user nhập tay trên form (override).

### Thay đổi
1. **`src/lib/inventory.functions.ts`**
   - Đổi `async function nextStockVoucherNo` thành `export async function nextStockVoucherNo` để dùng chung.

2. **`src/lib/purchase-vouchers.functions.ts`**
   - Line 434 (luồng `postPurchaseVoucher` — tự tạo phiếu nhập khi ghi sổ):
     `voucher_no: (v as any).stock_voucher_no || <gọi nextStockVoucherNo("in", v.voucher_date)>`
   - Line 784 (`stickStockVoucher`): thay `NK-${v.voucher_no}` bằng `nextStockVoucherNo("in", v.voucher_date)`.
   - Cập nhật `reason` giữ tham chiếu rõ ràng tới phiếu gốc (`Nhập kho từ phiếu mua {voucher_no}`).

3. **`src/lib/sales-vouchers.functions.ts`**
   - Line 669 (luồng ghi sổ phiếu bán — tự tạo phiếu xuất): tương tự, `nextStockVoucherNo("out", ...)`.
   - Line 1166 (`stickSalesStockVoucher`): tương tự cho xuất kho.

### Không đụng đến
- Các phiếu thu/chi/UNC (`PT-`, `BC-`, `PC-`, `UNC-`) — đó là số chứng từ tiền, sẽ xử lý sau nếu cần.
- Schema database (`stock_vouchers.voucher_no` đã tồn tại + cột override `stock_voucher_no` trên phiếu mua/bán đã có).
- Trang Kho/Phiếu nhập-xuất, Phiếu chưa nhập-xuất — chỉ hiển thị, không phải sửa.

## Kết quả người dùng thấy
- Phiếu nhập kho luôn có dạng `PNK2026-00007`, phiếu xuất `PXK2026-00012` — liên tục, đúng quy chuẩn kế toán.
- Phần ghi chú/diễn giải vẫn ghi rõ "Nhập từ phiếu mua PM…/Xuất từ phiếu bán PB…" để truy vết.
- User vẫn có thể tự nhập `stock_voucher_no` trên form phiếu mua/bán để ép số theo ý mình.

Bạn duyệt để mình triển khai nhé?
