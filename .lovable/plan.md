## Mục tiêu

Xây 2 dialog độc lập (giống Phiếu mua hàng / bán hàng) để **Tạo & sửa Phiếu nhập kho / Phiếu xuất kho** với đầy đủ thông tin như ảnh tham chiếu, hỗ trợ nhiều dòng hàng hoá, tự sinh số phiếu `PNK{YYYY}-00001` / `PXK{YYYY}-00001`, in ra mẫu chuẩn 01-VT / 02-VT.

## Trường thông tin (theo ảnh)

**Header chung:**
- Loại nhập/xuất (kind) — preset: Mua hàng / Trả NCC / Khác (nhập) · Bán hàng / Sản xuất / Trả lại / Khác (xuất)
- Định khoản đối ứng (TK 331/111/621/641…) — combobox tài khoản
- Đối tượng đối ứng (NCC / Khách hàng / Nhân viên) — combobox party
- Số chứng từ — auto `PNK2026-00001` / `PXK2026-00001`, cho phép sửa
- Chi nhánh — combobox `branches`
- Ngày chứng từ
- Số chứng từ gốc đi kèm (HĐ, hợp đồng…)
- Số chứng từ giao nhận (nhập) / SĐT người nhận (xuất)
- Người giao + Địa chỉ giao + Người nhận (nhập)
- Người nhận + SĐT + Người giao hàng + Địa chỉ nhận (xuất)
- Nội dung nhập / Lý do xuất (textarea)

**Bảng dòng hàng hoá (nhiều dòng, giống phiếu mua):**
- STT | Mặt hàng (combobox) | Mã (auto) | TK kho (152/156/155…) | Đơn vị (auto) | Kho | Số lượng | [Phương pháp giá kho – chỉ xuất] | Đơn giá / Giá xuất kho | Thành tiền | Xoá
- Nút **Thêm** (1 dòng) và **Thêm nhiều** (chọn nhiều mặt hàng cùng lúc)
- Hàng "Tổng" cuối bảng + chỉ báo **Tổng** ở góc phải header

**Footer:** Đính kèm tài liệu · In Phiếu nhập/xuất kho · Huỷ · Lưu và thoát

## Thay đổi mã nguồn

**1. Migration DB** — thêm cột vào `stock_vouchers`:
- `kind text` (loại nhập/xuất con: purchase/return_supplier/other_in · sale/production/return_customer/other_out)
- `branch_id uuid` (FK branches), `party_id uuid`, `party_name text`, `party_phone text`, `party_address text`
- `deliverer_name text` (người giao hàng cho phiếu xuất / người giao bên ngoài)
- `receiver_name text` (người nhận)
- `source_doc_no text` (số HĐ/CT gốc đi kèm), `source_doc_date date`
- `transfer_doc_no text` (số CT giao nhận – chỉ nhập)
- `attachments_count int`
- Thêm cột `costing_method text` vào `stock_movements` (chỉ dùng cho dòng xuất; mặc định lấy từ product/setting)

**2. Server functions** (`src/lib/inventory.functions.ts`):
- Mở rộng `VoucherCreateSchema` & `VoucherUpdateSchema` để nhận tất cả trường mới ở header và `costing_method` ở từng dòng
- Cập nhật `createStockVoucher`, `updateStockVoucher`, `getStockVoucher` ghi/đọc các cột mới
- Đổi `nextStockVoucherNo`: prefix `PNK{YYYY}-` / `PXK{YYYY}-`, padStart 5

**3. Component mới `src/components/inventory/StockVoucherFormDialog.tsx`**
- Props: `type: "in" | "out"`, `open`, `onOpenChange`, `voucherId?` (sửa), `onSaved?`
- Layout 4 cột header + bảng dòng + footer như ảnh
- Combobox dùng lại: `AccountCombobox`, `PartyCombobox` (tách từ `voucher-form.tsx`), product picker từ `VoucherListPage`
- "Thêm nhiều": dialog phụ chọn nhiều sản phẩm có checkbox
- Auto-fill: Mã + Đơn vị + TK kho (từ `products.stock_account`) + Giá xuất kho (từ avg cost) khi chọn mặt hàng
- Tự tính Thành tiền = SL × Đơn giá; ô Tổng cập nhật realtime
- Bấm "Lưu và thoát" → gọi `createStockVoucher` / `updateStockVoucher`, toast, invalidate queries

**4. Wire entry points**
- `src/routes/_app/inventory/index.tsx`: nút "Tạo phiếu nhập kho" + "Tạo phiếu xuất kho" mở dialog tương ứng (thay vì link đến trang vouchers)
- `src/components/inventory/VoucherListPage.tsx`:
  - Nút "+ Tạo phiếu nhập" và "+ Tạo phiếu xuất" trên header
  - Nút Sửa (Pencil) mở `StockVoucherFormDialog` ở chế độ edit thay vì dialog cũ
  - Giữ dialog xem chi tiết hiện tại (read-only)

**5. Cập nhật `src/lib/printVoucher.ts`** — bổ sung khối thông tin:
- Đơn vị/Bộ phận (chi nhánh)
- Người giao + địa chỉ + đơn vị · Người nhận
- "Theo … số … ngày …" (số HĐ gốc)
- Số CT kèm theo
- 5 chữ ký: Người lập · Người giao · Người nhận · Thủ kho · Kế toán trưởng

## Phạm vi không động đến

- Logic tồn kho, bút toán tự sinh, giá vốn bình quân — giữ nguyên
- Phiếu chuyển kho (transfer) — không nằm trong yêu cầu này
- Trang Tồn kho / Thẻ kho / Báo cáo — không đổi

## Sau khi xong

Người dùng có thể bấm "Tạo phiếu nhập/xuất kho" → form đẹp giống ảnh → nhập nhiều dòng → Lưu → xem & in ra mẫu 01-VT/02-VT đầy đủ.