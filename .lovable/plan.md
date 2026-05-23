## Mục tiêu

Trong Form **Tạo phiếu mua hàng** và **Tạo phiếu bán hàng**, khi user tick checkbox **Nhập kho** / **Xuất kho**, hiển thị một khu vực (panel) cho phép nhập thông tin phiếu kho liên quan. Hiện tại checkbox chỉ ngầm tạo phiếu kho với số/ngày/kho mặc định, user không xem hay sửa được.

## Phạm vi UI

Panel chỉ hiển thị khi checkbox được bật. Gồm các trường:

- **Kho** (`warehouse_id`) — Select, bắt buộc. Mặc định = kho đầu tiên / kho mặc định của tenant.
- **Số phiếu kho** (`stock_voucher_no`) — Input text, auto-suggest `NK-{voucher_no}` cho mua hàng và `XK-{voucher_no}` cho bán hàng; user có thể sửa.
- **Ngày phiếu kho** (`stock_voucher_date`) — Date, mặc định = ngày chứng từ của phiếu mua/bán.
- **Diễn giải** (`stock_voucher_reason`) — Input text, mặc định "Nhập kho từ phiếu {voucher_no}" / "Xuất kho theo phiếu {voucher_no}".

Panel đặt ngay dưới hàng checkbox toggle (border + bg-muted/30 nhẹ để phân vùng).

## Phạm vi dữ liệu / Server

Mở rộng input của 2 serverFn create voucher để chấp nhận các trường mới (cùng với `warehouse_id` đã có):

- `src/lib/purchase-vouchers.functions.ts`
  - Thêm vào schema: `stock_voucher_no?: string`, `stock_voucher_date?: string (date)`, `stock_voucher_reason?: string`.
  - Khi insert vào `stock_vouchers`: dùng giá trị user nhập nếu có, fallback về logic cũ (`NK-{voucher_no}`, `v.voucher_date`, `Nhập kho từ {voucher_no}`).
- `src/lib/sales-vouchers.functions.ts`
  - Tương tự với prefix `XK-` và reason "Xuất kho theo phiếu...".

Không thay đổi cấu trúc DB — các giá trị này chỉ ghi vào `stock_vouchers` đã có.

## Phạm vi FE form

- `src/routes/_app/purchases/vouchers.tsx`
  - Thêm vào `header` state: `warehouse_id`, `stock_voucher_no`, `stock_voucher_date`, `stock_voucher_reason`.
  - Query danh sách kho (`warehouses`) khi dialog mở (reuse listWarehouses nếu có, hoặc gọi qua serverFn hiện hữu).
  - Khi tick "Nhập kho": auto fill 4 trường từ `voucher_no`/`voucher_date` (nếu trống), render panel.
  - Khi đổi `voucher_no` hoặc `voucher_date` mà user chưa chạm vào các field stock voucher (`*_touched` flags), cập nhật theo.
  - Gửi 4 trường này lên server trong payload mutation.
- `src/routes/_app/sales/vouchers.tsx`: thay đổi tương tự, dùng prefix `XK-` và nhãn "Xuất kho".

## Edge cases

- Phiếu không có dòng hàng hoá (chỉ chi phí/dịch vụ): server vẫn skip tạo phiếu kho ngay cả khi tick — giữ behavior cũ, không cần xử lý FE.
- User bỏ tick lại sau khi đã nhập: ẩn panel nhưng giữ state để khi tick lại không mất; chỉ không gửi lên payload (`create_stock_voucher=false`).
- Số phiếu kho trùng: server tự throw lỗi DB (constraint hiện có) — toast hiển thị message.

## Files dự kiến chỉnh

- `src/routes/_app/purchases/vouchers.tsx`
- `src/routes/_app/sales/vouchers.tsx`
- `src/lib/purchase-vouchers.functions.ts`
- `src/lib/sales-vouchers.functions.ts`
