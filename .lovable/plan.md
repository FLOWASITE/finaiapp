## Bối cảnh

Phiếu hóa đơn `1C26TYY-00000138` ngày `2026-04-14` đã được tạo trong `sales_vouchers` sau khi duyệt từ Inbox AI, nhưng tab Phiếu bán hàng lọc mặc định "Tháng này" (tháng 5/2026) nên không thấy. Ngoài ra có 1 phiếu trùng `00000138` (thiếu tên KH).

## Các thay đổi

### 1. Chuẩn hóa số phiếu bán hàng tự sinh từ Inbox AI
Trong `src/lib/inbox-ai.functions.ts` (`materializeSalesVoucherFromDocument`):
- Số phiếu tự sinh theo cùng định dạng mà module Phiếu bán hàng đang dùng: `BHYYYY-#####` (giống `nextVoucherNo` của `sales-vouchers.functions.ts`).
- KHÔNG dùng `series-invoice_no` (như `1C26TYY-00000138`) làm `voucher_no` nữa.
- Lưu `invoice_series` + `invoice_no` của HĐĐT vào cột riêng (hoặc trong `notes`) để vẫn tra cứu được, và dùng cặp này để chống trùng.

### 2. Luôn tạo mới khách hàng nếu chưa có
Helper hiện đã tự tạo customer khi không thấy MST trùng. Bổ sung:
- Nếu MST người mua không có sẵn, cũng tự tạo customer mới (chỉ dùng tên + địa chỉ làm khoá phụ).
- Sinh mã KH tự động dạng `KH#####` để không vi phạm ràng buộc unique.
- Đảm bảo `customer_id` luôn được set vào phiếu bán hàng.

### 3. Chống ghi sổ hóa đơn trùng (HARD STOP)
Trong `approveInboxItem` của `src/lib/inbox-ai.functions.ts`:
- Trước khi tạo bút toán + phiếu, kiểm tra trong `sales_vouchers` cùng tenant đã tồn tại phiếu có cùng (`invoice_series` + `invoice_no`) hoặc cùng số HĐĐT chưa.
- Nếu trùng và phiếu cũ KHÔNG ở trạng thái `void`: ném lỗi rõ ràng "Hóa đơn `<series-no>` đã được ghi sổ — không ghi sổ trùng". UI sẽ hiển thị toast đỏ và card không chuyển trạng thái.
- Nếu trùng nhưng phiếu cũ đã `void`: cho phép tạo lại.

### 4. Đổi bộ lọc mặc định Phiếu bán hàng sang "Năm này"
Trong `src/routes/_app/sales/vouchers.tsx`:
- Đổi `defaultPeriod` từ `getPresetRange("thisMonth")` sang `getPresetRange("thisYear")`.
- Áp dụng tương tự cho điều kiện reset filter.

### 5. Dọn dữ liệu trùng hiện tại
- Xóa phiếu trùng `00000138` (id `1ab5254f-a4fd-4257-810b-b29ed1bfd4ef`) và line tương ứng — phiếu này thiếu tên KH, MST.
- Giữ lại phiếu `1C26TYY-00000138` (id `c27734d6-…`) đã có đầy đủ thông tin KH.
- Đổi `voucher_no` của phiếu giữ lại sang `BH2026-00006` để đồng bộ với quy ước chuẩn (kế tiếp `BH2026-00005`).

## Xác nhận sau khi sửa
- Mở tab Phiếu bán hàng: thấy phiếu `BH2026-00006` (Kim Oanh) trong danh sách năm này.
- Thử duyệt lại cùng hóa đơn `1C26TYY-00000138` từ Inbox AI: phải báo lỗi "đã ghi sổ".
- Duyệt 1 hóa đơn mới: tự tạo customer (nếu chưa có) + phiếu `BH2026-00007`.

## File sửa
- `src/lib/inbox-ai.functions.ts`
- `src/routes/_app/sales/vouchers.tsx`
- Backfill dữ liệu qua data migration