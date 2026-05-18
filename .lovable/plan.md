
## Mục tiêu

Đọc file XML hoá đơn điện tử chuẩn Tổng cục Thuế (TT78/TT32 — gốc `<HDon>`) và nạp vào hệ thống:
- Tự nhận diện chiều: nếu MST của tenant trùng `NBan/MST` → tạo **Hoá đơn bán ra** (`sales_invoices`). Nếu trùng `NMua/MST` → tạo **Hoá đơn mua vào** (`invoices`). Không trùng cả hai → báo lỗi cho file đó.
- Cho phép chọn **nhiều file XML** cùng lúc, hiển thị bảng kết quả từng file.

## Mapping XML → DB

| XML | Trường |
|---|---|
| `KHHDon` + `SHDon` | `invoice_series` + `invoice_no` |
| `NLap` | `issue_date` |
| `NBan/{Ten,MST,DChi}` | supplier (khi mua) hoặc bỏ qua (khi bán) |
| `NMua/{Ten,MST,DChi}` | customer (khi bán) hoặc bỏ qua (khi mua) |
| `TToan/TgTCThue` | `subtotal` |
| `TToan/TgTThue` | `vat_amount` |
| `TToan/TgTTTBSo` | `total` |
| `DSHHDVu/HHDVu[]` | dòng (`invoice_lines` hoặc `sales_invoice_lines`): `THHDVu`→description, `DVTinh`, `SLuong`→qty, `DGia`→unit_price, `ThTien`→amount/pre_vat_amount, `TSuat` "10%"→`vat_rate=10`, `TThue`→line_vat_amount |
| `MCCQT` | `einvoice_code` (cho HĐ bán) |

Chống trùng: kiểm tra `(tenant_id, invoice_no, supplier_tax_id|customer_tax_id, issue_date)` — nếu đã có → đánh dấu "Đã tồn tại", không tạo mới.

## Thay đổi code

**1. Dependency**
- `bun add fast-xml-parser` (Worker-compatible, pure JS).

**2. Server function — `src/lib/einvoice-xml.functions.ts`**
- `importEinvoiceXml({ files: Array<{ name, content }> })` — `requireSupabaseAuth` + đọc tenant hiện tại từ `profiles.active_tenant_id`.
- Với mỗi file:
  1. Parse XML → object `{ ttChung, nBan, nMua, lines, totals }`.
  2. So sánh MST với `tenants.tax_id` → quyết định chiều.
  3. Upsert `suppliers` (theo `tax_id`, scope `user_id`) hoặc `customers`.
  4. Insert `invoices` (lưu XML gốc lên bucket `invoices` làm `file_path`, status `extracted`) + `invoice_lines`; hoặc `sales_invoices` + `sales_invoice_lines` (status `draft`, gắn `einvoice_code` từ MCCQT).
  5. Trả về `{ name, status: 'created'|'duplicate'|'error', direction, invoiceId?, error? }`.

**3. UI — `src/components/import-einvoice-xml-dialog.tsx`**
- Dialog dùng chung, mở từ 2 nơi:
  - Nút "Nhập XML hoá đơn" trên `/invoices` (Hoá đơn mua vào).
  - Nút tương tự trên `/sales` (Hoá đơn bán ra).
- Cho chọn nhiều file (`<input type="file" multiple accept=".xml">`), đọc text trong trình duyệt, gọi server fn 1 lần.
- Hiển thị bảng kết quả: tên file • chiều (Mua/Bán) • số HĐ • tổng tiền • trạng thái (✓ Đã tạo / ⚠ Trùng / ✗ Lỗi + lý do). Có link mở HĐ vừa tạo.
- Sau khi đóng, `router.invalidate()` để 2 trang refresh danh sách.

**4. Cập nhật nhẹ**
- `src/routes/_app/invoices/index.tsx` & `src/routes/_app/sales/index.tsx`: thêm nút mở dialog (cạnh nút Upload OCR / Tạo HĐ).
- Không sửa schema DB, không sửa OCR cũ.

## Phạm vi không làm

- Không xác minh chữ ký số CQT (chỉ đọc dữ liệu nghiệp vụ).
- Không tự sinh bút toán/journal entry — vẫn dùng luồng hiện có sau khi HĐ đã tạo.
- Không import ZIP/PDF kèm XML ở vòng này.
