# Quản lý tỷ lệ quy đổi đơn vị tính

## Mục tiêu
Cho phép một mặt hàng có nhiều đơn vị tính khác nhau (VD: 1 Thùng = 24 Chai, 1 kg = 1000 g). Khi lập phiếu nhập/xuất, người dùng chọn đơn vị giao dịch và hệ thống tự quy đổi ra **đơn vị gốc** (đơn vị khai báo trên mặt hàng) để cập nhật tồn kho và ghi sổ.

## Mô hình dữ liệu
Tạo bảng `product_unit_conversions`:
- `product_id` — mặt hàng
- `unit` — đơn vị thay thế (VD: "Thùng")
- `factor` — 1 `unit` = `factor` × đơn vị gốc của mặt hàng (VD: 24)
- `is_default_purchase`, `is_default_sale` — đánh dấu đơn vị mặc định khi mua/bán (tuỳ chọn)
- `note`
- RLS theo tenant như các bảng khác; unique `(product_id, unit)`.

Đơn vị gốc (factor = 1) luôn là `products.unit` — không cần lưu, mặc định có sẵn trong dropdown.

## Backend (`src/lib/unit-conversions.functions.ts` — mới)
- `listConversions({ product_id })` — danh sách quy đổi của 1 mặt hàng.
- `upsertConversion` — thêm/sửa; validate factor > 0, đơn vị tồn tại trong `product_units`, không trùng đơn vị gốc.
- `deleteConversion`.
- `getConversionsBulk({ product_ids })` — trả map dùng cho form phiếu.

Cập nhật `inventory.functions.ts` (`createStockVoucher` + `updateStockVoucher`):
- Mỗi dòng nhận thêm `unit` (đơn vị giao dịch) và `qty_in_unit` (số lượng theo đơn vị đó); server tra factor và tính `qty_base = qty_in_unit × factor`, `unit_cost_base = unit_cost_in_unit / factor`. Lưu cả 2 (thêm cột `txn_unit`, `txn_qty`, `txn_unit_cost`, `conversion_factor` vào `stock_voucher_lines`) để hiển thị/in lại đúng nguyên trạng.

## UI
1. **Trang chi tiết mặt hàng** (`/inventory/$id`) — thêm tab/section "Đơn vị quy đổi" với bảng CRUD inline (đơn vị, hệ số, ghi chú, đánh dấu mặc định nhập/xuất). Hiển thị ví dụ "1 Thùng = 24 Chai" để dễ kiểm tra.
2. **Form phiếu nhập/xuất** (`StockVoucherDialog` + dialog sửa trong `VoucherListPage`):
   - Thêm cột "ĐVT" trên mỗi dòng (Select các đơn vị: gốc + các quy đổi của mặt hàng đó).
   - Khi đổi đơn vị: gợi ý đơn giá theo factor; hiển thị nhỏ bên dưới "= X <đv gốc>" và "Thành tiền" tính theo qty × unit_cost (giá trị tổng không đổi giữa các đơn vị).
   - Validate tồn kho cho phiếu xuất dùng `qty_base`.
3. **In phiếu** — hiển thị đơn vị giao dịch + ghi chú quy đổi.

## File thay đổi
- Migration mới: bảng `product_unit_conversions` + cột bổ sung trên `stock_voucher_lines`.
- Mới: `src/lib/unit-conversions.functions.ts`, `src/components/inventory/unit-conversions-editor.tsx`.
- Sửa: `src/lib/inventory.functions.ts`, `src/routes/_app/inventory/index.tsx`, `src/routes/_app/inventory/$id.tsx`, `src/components/inventory/VoucherListPage.tsx`, `src/lib/printVoucher.ts`.

Bạn duyệt để mình triển khai theo plan này nhé?