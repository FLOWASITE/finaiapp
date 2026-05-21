## So sánh với Phiếu mua hàng chuẩn (theo ảnh)

### ❌ Những gì Phiếu mua hàng hiện tại còn THIẾU

#### 1. Bảng dòng hàng (lines) — **THIẾU NẶNG NHẤT**
Form hiện tại chỉ có **1 dòng tổng** (subtotal/VAT/total). Chuẩn yêu cầu bảng nhiều dòng với các cột:
- STT
- Tên sản phẩm (*) — chọn từ products
- Mã (auto từ product)
- Hoá đơn (*) — link tới hoá đơn dòng (cho phép 1 phiếu gom nhiều HĐ)
- TK nợ (kho/chi phí — mặc định 156/152/642…)
- Số lượng (*)
- Đơn giá (*)
- Giá trị trước thuế (= SL × ĐG)
- Giảm giá (%) / Giảm giá (số tiền)
- TK thuế GTGT (*) — 1331 / 1332
- Thuế suất (%)
- Tiền thuế
- Thành tiền
- Nút **Thêm / Thêm nhiều / Xoá hết** từng dòng
- Dòng **Tổng** cộng dồn ở cuối

*(DB `purchase_voucher_lines` đã có, nhưng UI chưa expose — cần mở rộng schema thêm: discount_pct, discount_amount, vat_account, debit_account theo dòng, invoice_line_id)*

#### 2. Header — thiếu các trường chuẩn
- **Trạng thái thanh toán** (dropdown: Chưa TT / Đã TT / TT một phần)
- **Hình thức nhận hoá đơn** (Nhận kèm HĐ / Nhận chưa kèm HĐ / Chỉ HĐ không hàng)
- **Nhập kho** (checkbox header — sinh phiếu nhập kho ngay)
- **Chi phí mua hàng** (checkbox — phiếu chỉ ghi chi phí, không nhập kho)
- **Chi phí không được trừ** (checkbox — phục vụ quyết toán thuế TNDN)
- **TK công nợ phải trả** (3311 / 3312 / 3388) — hiện cứng `credit_account`
- **Nhóm khách hàng** (customer_group)
- **Địa chỉ NCC** (auto-fill từ supplier)
- **Chi nhánh** (branch_id) — đã có DB, chưa hiện UI
- **Ngoại tệ** + tỷ giá (currency có sẵn nhưng UI thiếu, cần thêm `exchange_rate`)
- **Hạn thanh toán** (due_date)

#### 3. Tabs / cấu trúc form
- **Tab "Phiếu mua hàng" vs "Hoá đơn"** — cho phép cùng lúc nhập 2 mặt: bút toán mua + thông tin HĐ đầu vào (số HĐ, ký hiệu, ngày HĐ, MST NCC) cho báo cáo thuế GTGT
- **Sub-tab "Giá trị hàng" vs "Chi phí mua hàng"** — chi phí mua hàng (vận chuyển, bốc xếp) phân bổ vào giá vốn

#### 4. Phân bổ & chiết khấu cấp phiếu
- **Tự phân bổ chi phí mua hàng** (checkbox) — phân bổ theo giá trị hoặc số lượng
- **Chiết khấu (%)** / **Chiết khấu (số tiền)** cấp phiếu — phân bổ về từng dòng

#### 5. Trang chi tiết phiếu
- Hiện chỉ có list + dialog tạo. Cần route `/_app/purchases/vouchers/$id` để xem/sửa/duyệt/in phiếu, xem các chứng từ liên kết (JE, Stock voucher, Cash voucher).

---

## Kế hoạch triển khai (chia 3 phase)

### Phase 1 — Multi-line + header chuẩn (ưu tiên cao)
1. Migration `purchase_voucher_lines`: thêm cột `line_no`, `product_code`, `discount_pct`, `discount_amount`, `vat_account`, `debit_account` (per line), `invoice_line_id` (nullable FK), `invoice_no` (text — cho phép gom HĐ chưa import).
2. Migration `purchase_vouchers`: thêm `payment_status`, `invoice_receipt_type` (with/without/invoice_only), `is_purchase_cost`, `is_non_deductible`, `customer_group_id`, `supplier_address`, `exchange_rate`, `due_date`, `discount_pct`, `discount_amount`, `auto_allocate_cost`.
3. Cập nhật `createPurchaseVoucher` / `updatePurchaseVoucher` / `postPurchaseVoucher`:
   - Lưu lines đầy đủ, tính total từ lines
   - Sinh JE: mỗi line 1 dòng Nợ TK kho/CP; tổng VAT 1 dòng Nợ 133*; 1 dòng Có 331/111/112
   - Sinh Stock voucher: gom các line `line_type='goods'` có `product_id`
4. Mở rộng dialog tạo phiếu:
   - Thay phần "Thành tiền / VAT / Tổng" cứng bằng **bảng lines** có Add/Add-many/Clear, auto-tính subtotal/VAT/total từ lines
   - Thêm các trường header còn thiếu (payment_status, receipt_type, due_date, branch, currency+rate, address auto-fill)
   - Thêm checkbox **Nhập kho** header (đồng nghĩa `create_stock_voucher`)

### Phase 2 — Tabs & phân bổ
- Tabs "Phiếu mua hàng / Hoá đơn" với thông tin HĐ đầu vào (mẫu số, ký hiệu, số HĐ, ngày, MST) → đẩy vào bảng `purchase_invoices` khi ghi sổ nếu chưa link
- Sub-tab **Chi phí mua hàng** + auto-phân bổ về dòng goods (theo amount hoặc qty)
- Chiết khấu cấp phiếu phân bổ về line

### Phase 3 — Trang chi tiết + workflow
- Route `/_app/purchases/vouchers/$id` (view/edit/post/void/print)
- Nút **Stick nhập kho** trên list (đã có function `stickStockVoucher`, chưa gắn UI)
- Liên kết xem JE / Stock / Cash voucher

---

## Câu hỏi trước khi build

1. Triển khai **Phase 1 đầy đủ** (DB migration + UI multi-line + JE per-line), hay làm trước **chỉ UI multi-line** (giữ DB hiện tại, ghi gộp subtotal)?
2. Tab "Hoá đơn" có cần ngay không, hay để Phase 2?
3. Có cần trang chi tiết phiếu (`/vouchers/$id`) trong cùng đợt này?
