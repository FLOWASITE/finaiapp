## Mục tiêu

Tại cột **Tên sản phẩm** trong dòng phiếu mua hàng, thay `Input` thuần bằng **Product Picker** dạng popover/table giống ảnh người dùng đưa. Khi chọn 1 sản phẩm → tự fill các trường liên quan của dòng.

## UI Picker (popover, mở khi click ô "Tên sản phẩm")

Header bảng theo đúng ảnh:

| Mã sản phẩm | Tên sản phẩm | Loại sản phẩm | Đơn vị | Giá mua | SL tồn | GT tồn | Giá xuất kho |

- Input search ở trên (filter theo `code` / `name`, không phân biệt dấu).
- Bảng cuộn dọc, hover highlight, click row → chọn.
- Map `item_type`: `goods` → "Hàng hóa", `service` → "Dịch vụ", `combo` → "Combo". Với hàng có `stock_account = 152` hiển thị "Nguyên vật liệu" (suy từ stock_account để khớp ảnh).
- Cột số: format `vi-VN`, canh phải, mono.
- Footer popover: nút "+ Thêm sản phẩm mới" (link `/items`) — optional, giữ scope nhỏ chỉ làm khi nhanh.

## Auto-fill khi chọn

Từ product → patch line:
- `product_id` ← id
- `product_code` ← code
- `product_name` ← name
- `unit` ← unit
- `unit_price` ← unit_cost (giá mua bình quân, là default; user vẫn sửa được)
- `vat_rate` ← vat_rate
- `debit_account` ← stock_account (156/152/153…)
- `line_type` ← map từ `item_type` (`goods`→goods, `service`→service, `combo`→goods)
- Gọi `recalcLine` để cập nhật amount/vat/total.

## Data

Tái sử dụng `listProducts` (đã có). Cache trong `useQuery(['products-picker'])` với `QUERY_PRESETS.REFERENCE`.

## File thay đổi

- `src/routes/_app/purchases/vouchers.tsx`
  - Thêm component nội bộ `ProductPickerCell` (Popover + bảng tìm kiếm).
  - Thay `<Input value={l.product_name} ... />` ở cột Tên sản phẩm bằng `<ProductPickerCell value={l.product_name} onPick={(p) => updateLine(l.key, {...})} />`.
  - Mã sản phẩm: hiển thị từ pick (vẫn cho sửa tay).

Không thay đổi DB, server function, hay business logic khác.

## Out of scope (lần này)

- Tạo sản phẩm mới ngay trong picker.
- Đa đơn vị (unit conversion) — pick mặc định đơn vị gốc.
- Chọn nhiều sản phẩm cùng lúc (multi-select).
