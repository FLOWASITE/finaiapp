# Trang in A4 Đơn đặt hàng bán

Tạo route mới `/_app/sales/orders/$id/print` hiển thị Đơn đặt hàng theo khổ A4, dùng `getSalesOrder` đã có (không thêm server function).

## Tệp tạo mới
`src/routes/_app/sales/orders.$id.print.tsx`

## Nội dung trang in

**Header** (2 cột):
- Trái: Tên công ty, địa chỉ, mã số thuế, SĐT của tenant
- Phải: Số đơn (`order_no`), ngày lập, hạn giao, hiệu lực đến

**Tiêu đề lớn**: "ĐƠN ĐẶT HÀNG" + dòng "Số: …"

**Thông tin khách hàng**: tên, mã, MST, SĐT, email, địa chỉ giao hàng, điều khoản thanh toán, ghi chú.

**Bảng hàng hoá** (giống mẫu hóa đơn 200):
STT | Mã | Tên hàng | ĐVT | SL | Đơn giá | CK | Thành tiền trước VAT | %VAT | Tiền VAT | Tổng.

**Tổng cộng**:
- Cộng tiền hàng, tổng chiết khấu, tổng VAT, tổng thanh toán
- Số tiền bằng chữ (dùng helper sẵn có nếu có, nếu không format số)

**Chân trang** (4 ô ký): Khách hàng | Người lập | Kế toán trưởng | Giám đốc.

**Trạng thái & cọc** (nếu bật): hiển thị badge `status`, "Yêu cầu cọc X%", "Đã nhận cọc: …" — chỉ in khi có dữ liệu.

## Style & in ấn

- Font serif, cỡ 12px, layout `max-w-5xl mx-auto`
- Class `print:hidden` cho thanh action (nút Quay lại + Nút In)
- Class `print:p-0 print:font-serif`, ẩn shadow
- Trigger `window.print()` qua nút "In"
- Link quay lại `/sales/orders/$id`

## Tích hợp UI

Thêm nút "In" trong `src/routes/_app/sales/orders.$id.tsx` (header detail) trỏ tới route in mới — chỉ thêm 1 `<Link>` + Button, không sửa logic khác.

## Helper dùng lại

- Format số: `new Intl.NumberFormat("vi-VN")`
- Format ngày: chuỗi "Ngày dd tháng MM năm yyyy"
- Tham khảo layout từ `src/routes/_app/assets/inventory.$id.print.tsx` đã có pattern chuẩn

Không thay đổi schema, không thêm migration, không sửa server function.
