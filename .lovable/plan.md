## Mục tiêu

Một mã Dịch vụ duy nhất có thể vừa bán vừa mua , và Hệ thống tự ánh xạ đúng tài khoản theo từng phân hệ (Bán / Mua).

## 1. Cơ sở dữ liệu (migration)

Thêm cột vào bảng `products`:

- `can_be_sold boolean NOT NULL DEFAULT true` — cho phép xuất hiện trong Hoá đơn bán / Phiếu bán
- `can_be_purchased boolean NOT NULL DEFAULT true` — cho phép xuất hiện trong Hoá đơn mua / Phiếu mua
- `expense_account text` — TK chi phí khi mua (ví dụ 154/627/642). Mặc định `'642'` cho service, để trống cho goods (vẫn dùng `stock_account` 156 khi mua hàng hoá)

Backfill: tất cả bản ghi hiện có đặt `can_be_sold = true`, `can_be_purchased = true`; với `item_type='service'` set `expense_account = '642'` nếu null.

Ràng buộc mềm (validation ở app layer, không CHECK constraint cứng):

- Nếu `can_be_sold` → `revenue_account` bắt buộc
- Nếu `can_be_purchased` và là `service` → `expense_account` bắt buộc
- Nếu `can_be_purchased` và là `goods/combo` → dùng `stock_account` (đã có)

## 2. Server function `upsertProduct`

`src/lib/inventory.functions.ts`:

- Mở rộng `ProductSchema` với 3 trường mới (`can_be_sold`, `can_be_purchased`, `expense_account`)
- Kiểm tra: ít nhất một trong hai cờ phải bật; nếu bật cờ thì TK tương ứng phải có giá trị

## 3. UI Danh mục `src/routes/_app/items/index.tsx`

**Dialog thêm/sửa mặt hàng:**

- Trong Tab "Thông tin chung" (hoặc một section mới "Tính chất sử dụng") thêm 2 checkbox:
  - ☐ Có thể bán 
  - ☐ Có thể mua
  - Hiển thị cho cả 3 loại; với "Dịch vụ" hai cờ này nổi bật hơn vì đây là use-case chính
- Tab "Kế toán" hiển thị ô nhập TK theo cờ:
  - `revenue_account` chỉ hiển thị khi `can_be_sold`
  - `expense_account` (mới) chỉ hiển thị khi `can_be_purchased` và là `service` — hint "154 / 627 / 642"
  - `stock_account` + `cogs_account` chỉ hiển thị khi là `goods`/`combo`
- Nút Lưu disable kèm tooltip nếu thiếu TK cần thiết

**Bảng danh sách:**

- Thêm 2 badge nhỏ "Bán" / "Mua" cạnh cột Loại cho biết tính chất
- Bộ lọc nhanh: dropdown "Dùng cho" với { Tất cả, Bán, Mua, Cả hai }
- Cột "TK DT / GV / Kho" đổi thành "TK DT / Chi phí / Kho" — hiển thị `expense_account` khi service

## 4. Phân hệ Giao dịch

**Mua hàng** `src/routes/_app/purchases/vouchers.tsx`:

- Product picker: lọc `can_be_purchased = true`
- Khi chọn 1 mặt hàng để thêm line:
  - Nếu `item_type='service'` → `account_code = expense_account`, `line_type='service'`, không yêu cầu kho
  - Nếu `goods/combo` → giữ logic hiện tại (stock_account, có kho)

**Bán hàng** `src/routes/_app/sales/vouchers.tsx`:

- Product picker: lọc `can_be_sold = true`
- Line tự nhận `revenue_account` (đã có), không đổi logic kho hiện tại

Áp dụng tương tự cho mọi nơi gọi `listProducts` để chọn item trong giao dịch mua/bán (kiểm tra: `sales_invoices`, `sales_orders`, `purchase_invoices` nếu có UI riêng).

## 5. Tương thích ngược

- Migration đặt `can_be_sold = can_be_purchased = true` cho dữ liệu cũ → mọi mặt hàng cũ vẫn dùng được ở cả hai phân hệ như hiện nay.
- `expense_account` mặc định `'642'` cho service cũ — kế toán có thể điều chỉnh sau.
- Không sửa các bảng giao dịch (`purchase_voucher_lines`, `sales_invoice_lines`) — đã có `account_code` per line.

## 6. Thứ tự triển khai

1. Migration DB (cần user duyệt)
2. Cập nhật `ProductSchema` + `upsertProduct`
3. Cập nhật Dialog + bảng ở `items/index.tsx`
4. Cập nhật product picker + auto account ở `purchases/vouchers.tsx` và `sales/vouchers.tsx`
5. Kiểm thử: tạo 1 dịch vụ "Kiểm toán" có cả bán + mua, lập 1 hoá đơn bán (TK 5113) và 1 hoá đơn mua (TK 154) cùng mã đó

Sẵn sàng triển khai khi bạn duyệt.