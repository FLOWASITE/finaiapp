# Tạo phiếu kho trực tiếp từ Phiếu mua/bán hàng

## Vấn đề hiện tại
Khi bấm "Tạo phiếu xuất kho" / "Tạo phiếu nhập kho" trong dropdown của dòng phiếu bán/mua, hệ thống điều hướng sang `/inventory/unposted` rồi user phải tìm lại dòng đó, bấm nút lần nữa, chọn kho trong dialog → tốn 2 bước thừa.

## Giải pháp
Cho phép tạo phiếu kho **ngay tại chỗ** trên trang Bán hàng / Mua hàng, không rời màn hình.

### Thay đổi UI
1. **`src/routes/_app/sales/vouchers.tsx`** và **`src/routes/_app/purchases/vouchers.tsx`**:
   - Đổi hành vi menu item "Tạo phiếu xuất/nhập kho": thay vì `navigate("/inventory/unposted")`, mở một **Dialog chọn kho** ngay trong trang.
   - Dialog chứa: tên phiếu gốc, Select chọn kho (dùng `listWarehouses`), nút Xác nhận.
   - Khi xác nhận → gọi `stickSalesStockVoucher` (sales) hoặc `stickStockVoucher` (purchases) trực tiếp.
   - Thành công → toast + invalidate query danh sách phiếu, dòng được cập nhật `stock_voucher_id` nên menu item tự ẩn.

2. **Mặc định kho thông minh**: nếu user chỉ có 1 kho, auto-chọn; nếu có kho mặc định trong settings, ưu tiên. (Nếu chưa có khái niệm kho mặc định thì bỏ qua.)

3. Giữ nguyên trang `/inventory/unposted` như một nơi tổng hợp để xử lý hàng loạt — không xoá, chỉ không còn là bước bắt buộc.

### Các nút "Xuất kho (Tạo phiếu xuất)" / "Nhập kho (Tạo phiếu nhập)" ở `SplitActionButton` trên trang index
- Giữ nguyên (đây là shortcut sang trang tổng hợp, hữu ích khi có nhiều phiếu chờ).

## Files sẽ sửa
- `src/routes/_app/sales/vouchers.tsx` — thêm state dialog + mutation `stickSalesStockVoucher`
- `src/routes/_app/purchases/vouchers.tsx` — thêm state dialog + mutation `stickStockVoucher`

## Không thay đổi
- Server functions (`stickSalesStockVoucher`, `stickStockVoucher`) đã sẵn sàng dùng inline.
- Trang `/inventory/unposted` giữ nguyên.

Bạn duyệt để mình triển khai nhé?
