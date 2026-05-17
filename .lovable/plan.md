# Kế hoạch: Hoàn thiện phân hệ Mua hàng

## Hiện trạng
- Upload ảnh/PDF hoá đơn → AI bóc tách trường (supplier, số, ngày, subtotal, VAT, total, lines).
- Trang chi tiết: review trường + gợi ý định khoản AI + ghi sổ.
- Bảng `invoices`, `invoice_lines`, `suppliers` đã có. Đã có `supplier_payments` (phải trả).

## Gap so với MISA / FAST
1. **Không có Purchase Order / Đơn đặt mua** — quy trình mua không bắt đầu từ PO.
2. **Không liên kết hoá đơn ↔ nhập kho** — mua hàng hoá không tự sinh phiếu nhập kho, không tự cộng tồn.
3. **Lines không gắn `product_id`** — không biết hoá đơn mua món gì → không cộng tồn được, không tính giá vốn bình quân.
4. **Không có danh sách nhà cung cấp** (chỉ tạo ngầm khi OCR). Không có trang `/suppliers`.
5. **Không có lọc/tìm kiếm/tổng hợp** ở list hoá đơn (theo NCC, kỳ, trạng thái).
6. **Trạng thái thiếu**: chưa có `unpaid`/`partial`/`paid` (đã có `supplier_payments` nhưng status invoice không cập nhật).
7. **Không nhập tay** — chỉ upload file. Cần form nhập hoá đơn không có file (mua dịch vụ, hoá đơn nhỏ).
8. **Không tách loại chi phí**: hoá đơn dịch vụ vs hàng hoá vs TSCĐ → định khoản khác nhau. Hiện AI đoán hết.
9. **Không có bảng kê thuế GTGT đầu vào** liên kết tự động sang `/tax`.
10. **Khoá sổ chưa được tôn trọng**: ghi sổ không check `is_period_locked`.

## Phạm vi Phase 6 — Mua hàng

### A. Đơn đặt mua (Purchase Order)
- Bảng `purchase_orders`, `purchase_order_lines` (supplier, ngày, trạng thái draft/sent/received/closed, expected_date).
- Trang `/purchases/orders` — danh sách + form tạo PO chọn supplier + products.
- Nút "Tạo hoá đơn từ PO" — kéo dòng PO vào `invoices`/`invoice_lines` với `product_id`.

### B. Liên kết hoá đơn ↔ kho ↔ sản phẩm
- Thêm cột `product_id` (nullable) và `type` (`goods`/`service`/`asset`) cho `invoice_lines`.
- Thêm cột `expense_account` cho hoá đơn dịch vụ (mặc định 642/641/627).
- Khi duyệt ghi sổ hoá đơn có dòng `goods` + `product_id` → tự sinh `stock_movements` (in) với `unit_cost` từ dòng, cập nhật `products.on_hand` + bình quân gia quyền (dùng lại logic `recordMovement`).
- Hạch toán đúng:
  - Hàng hoá: Nợ 156/152 / Nợ 1331 / Có 331
  - Dịch vụ: Nợ 642/641/627 / Nợ 1331 / Có 331
  - TSCĐ: Nợ 211 / Nợ 1331 / Có 331 + tự tạo `fixed_assets`

### C. Quản lý Nhà cung cấp
- Trang `/suppliers` — danh sách, thêm, sửa, xoá, xem dư nợ + 10 HĐ gần nhất.
- Form trên trang chi tiết HĐ: dropdown chọn supplier (thay vì chỉ text).
- Thêm trường `email`, `phone`, `payment_terms_days` cho `suppliers`.

### D. UX trang hoá đơn
- Trang list: filter theo NCC, khoảng ngày, trạng thái, search số HĐ. Tổng tiền + tổng VAT theo bộ lọc.
- Cột "Đã trả / Còn nợ" lấy từ `supplier_payments`.
- Tab `Nhập tay` trên list — form nhập hoá đơn không cần file (chọn loại goods/service/asset, dòng item).
- Trên detail: thêm chọn `type` cho từng line, dropdown `product` khi `goods`.
- Trạng thái mới: `draft`/`extracted`/`approved`/`paid`/`partial` — cập nhật tự động khi insert payment.

### E. Bảng kê thuế GTGT đầu vào
- Hàm `getInputVatList(month)` đọc `invoice_lines` (loại `goods`+`service`) trong kỳ → trả mẫu PL-01-1/GTGT.
- Trang `/tax` thêm tab "Đầu vào" hiển thị bảng + export.

### F. Tôn trọng khoá sổ
- Trong `approveJournalEntry` + bất kỳ serverFn ghi sổ nào: gọi `is_period_locked(userId, entry_date)` → từ chối nếu khoá.

## Kỹ thuật

### Migration
- `purchase_orders(id, user_id, supplier_id, order_date, expected_date, status, total, notes)`
- `purchase_order_lines(id, po_id, product_id, description, qty, unit_price, amount, vat_rate)`
- `ALTER invoice_lines ADD product_id uuid, line_type text DEFAULT 'goods'`
- `ALTER invoices ADD payment_status text DEFAULT 'unpaid', expense_account text, po_id uuid`
- `ALTER suppliers ADD email text, phone text, payment_terms_days int DEFAULT 30`
- Trigger: sau khi insert/delete `supplier_payments` → update `invoices.payment_status` theo `paid/total`.
- Cho phép EXECUTE `is_period_locked` cho `authenticated` (để serverFn gọi được), hoặc query trực tiếp `period_locks`.

### Server functions mới
- `src/lib/purchases.functions.ts`: `listPOs`, `upsertPO`, `convertPOToInvoice`, `listSuppliers`, `upsertSupplier`, `getSupplierDetail`, `createManualInvoice`, `getInputVatReport`.
- Mở rộng `approveJournalEntry` để: sinh `stock_movements` cho dòng `goods` có `product_id`, sinh `fixed_assets` cho dòng `asset`, check `is_period_locked`.

### Routes mới
- `/_app/purchases/orders/index.tsx` — list PO
- `/_app/purchases/orders/$id.tsx` — detail PO + convert
- `/_app/suppliers/index.tsx` — list + form
- `/_app/suppliers/$id.tsx` — detail + công nợ
- `/_app/tax/index.tsx` — thêm tab "Đầu vào"
- Sidebar nhóm **Mua hàng**: + Đơn đặt mua, + Nhà cung cấp.

## Ngoài phạm vi (Phase sau)
- Quy trình duyệt PO nhiều cấp.
- Nhập kho có chứng từ riêng + biên bản giao nhận.
- Đối chiếu 3 chiều PO ↔ phiếu nhập ↔ hoá đơn.
- Hoá đơn ngoại tệ (chờ phase đa tiền tệ hoàn chỉnh).
- Import Excel danh mục NCC / hoá đơn hàng loạt.

## Câu hỏi cho bạn
1. **Đơn đặt mua (PO)**: build đầy đủ ở phase này, hay chỉ làm B+C+D+E+F trước (PO để phase sau)?
2. **Tự sinh phiếu nhập kho khi ghi sổ HĐ hàng hoá**: bạn muốn tự động hoàn toàn, hay luôn yêu cầu kế toán xác nhận thủ công ở bước riêng?
3. **Form nhập tay**: ưu tiên dùng cho mua dịch vụ (tiền điện, internet, thuê văn phòng) hay cả mua hàng có sản phẩm trong kho?
4. **Bảng kê VAT đầu vào**: chỉ cần view trong app, hay cần export Excel theo mẫu PL-01-1/GTGT để nộp thuế?
