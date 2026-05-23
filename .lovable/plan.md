## Mục tiêu

Khi tick "Xuất kho" lúc ghi sổ Phiếu bán hàng:
- Bút toán doanh thu (Nợ 131 / Có 5111 / Có 3331) giữ ở `journal_entry` của Phiếu bán hàng.
- Bút toán giá vốn (Nợ 632 / Có 156) tách sang **`journal_entry` riêng**, gắn vào Phiếu xuất kho.
- Trên Bảng kê chứng từ: 2 dòng 632/156 hiển thị **Loại CT = "Phiếu xuất kho"**, **Số CT = số phiếu XK**.

## Thay đổi code

### 1. `src/lib/sales-vouchers.functions.ts` — hàm `postSalesVoucher`

Trong nhánh `if (v.create_stock_voucher && goodsLines.length > 0)`:

1. **Tạo `journal_entry` riêng cho giá vốn** (entry_date = `stock_voucher_date` hoặc `voucher_date`, description = `Giá vốn phiếu bán <voucher_no>`), trước khi insert `stock_vouchers`.
2. Khi insert `stock_vouchers`, set `journal_entry_id` = id của entry giá vốn mới (thay vì `entry.id` của phiếu bán).
3. Khi insert 2 dòng `journal_lines` Nợ 632 / Có 156, set `entry_id` = entry giá vốn mới, `line_order` bắt đầu từ 0.
4. Nếu `totalCogs === 0` → xoá luôn entry giá vốn vừa tạo (để không có entry rỗng), hoặc chỉ tạo entry sau khi tính xong tổng.

→ Phương án sạch hơn: gom 2 dòng cogs vào mảng trước, chỉ tạo `journal_entry` + insert `stock_vouchers` + insert `journal_lines` sau khi đã có `totalCogs > 0`. Nếu `totalCogs = 0` thì vẫn tạo phiếu xuất kho nhưng `journal_entry_id = null` (xuất kho không phát sinh giá vốn — hiếm, nhưng an toàn).

### 2. `src/lib/sales-vouchers.functions.ts` — hàm `voidSalesVoucher`

Hiện tại chỉ đảo `journal_entry_id` của phiếu bán. Cần bổ sung:
- Đọc `stock_voucher_id` → đọc `journal_entry_id` của phiếu xuất kho → tạo bút toán đảo tương tự cho entry giá vốn.
- Set `stock_vouchers.status = 'void'` (nếu cột status có) và đảo `stock_movements` (hoặc thêm dòng đảo qty) — kiểm tra logic huỷ stock hiện có; nếu phức tạp thì giữ nguyên hành vi stock như cũ, chỉ đảo bút toán giá vốn.

### 3. `src/lib/vouchers.functions.ts` — `loadVoucherMeta`

Không cần đổi logic priority: `stock_vouchers` đã set priority = 5 và `sales_vouchers` = 20. Vì giờ 2 entry tách rời, không còn xung đột `journal_entry_id`. Entry giá vốn chỉ được map bởi `stock_vouchers` → hiển thị đúng "Phiếu xuất kho" + số phiếu XK.

→ **Không cần sửa** file này, chỉ cần verify sau khi đổi.

## Không thay đổi

- UI Phiếu bán hàng, form, validation.
- Cấu trúc DB (không migration).
- Logic thu tiền / xuất hoá đơn điện tử.

## Rủi ro & lưu ý

- Các phiếu bán hàng **đã ghi sổ trước đây** vẫn giữ 1 entry gộp — không hồi tố. Bảng kê các kỳ cũ sẽ vẫn hiển thị 632/156 dưới nhãn "Phiếu bán hàng". Nếu cần migrate dữ liệu cũ, làm thành task riêng.
- `voidSalesVoucher` phải đảo cả 2 entry để cân sổ.
- Báo cáo Sổ cái / Tổng hợp không đổi tổng số (chỉ đổi nhãn nguồn chứng từ).
