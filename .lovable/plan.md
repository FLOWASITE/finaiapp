## Mục tiêu
Hiện tại báo cáo **Bảng kê chứng từ** (`/reports/voucher-list`) đang trả mỗi *dòng hạch toán* thành 1 dòng bảng, nên 1 phiếu (vd PT có 1 Nợ / 1 Có) hiện thành 2 dòng, với 2 cột số tiền (Phát sinh Nợ, Phát sinh Có).

Yêu cầu mới: **mỗi chứng từ = 1 dòng**, với:
- Cột **TK Nợ**
- Cột **TK Có**
- Cột **Số tiền** (1 cột duy nhất)

## Thay đổi
Chỉ chỉnh phần trình bày trong `src/routes/_app/reports/voucher-list.tsx`. Không sửa server function `getVoucherList` (vẫn trả về từng line) — gộp ở client để giữ nguyên dữ liệu, phân trang, dimensions, filter.

### 1. Luôn gộp theo chứng từ (entry_id)
- Bỏ checkbox "Gộp theo số CT" + state `groupByVoucher` (mặc định luôn gộp).
- Mở rộng cấu trúc `GroupedRow`:
  - `debitAccounts: string[]` — tất cả TK có phát sinh Nợ > 0
  - `creditAccounts: string[]` — tất cả TK có phát sinh Có > 0
  - `amount: number` — `max(tổng Nợ, tổng Có)` của phiếu (cân bằng kế toán nên 2 vế bằng nhau; dùng max để an toàn nếu lệch).
- Sắp xếp theo `entry_date`, `voucher_no` như hiện tại.

### 2. Cột bảng mới
Thay header & body:
```
Ngày | Số CT | Loại CT | Diễn giải | TK Nợ | TK Có | Số tiền |
Đối tác | Tham chiếu | Chi nhánh | Phòng ban | Dự án | TT chi phí
```
- **TK Nợ / TK Có**: nếu phiếu có nhiều TK cùng vế (vd phân bổ chi phí), hiện TK đầu tiên kèm `+N` (giống logic hiện tại của cột TK gộp), tooltip `title` liệt kê đầy đủ.
- **Số tiền**: font-mono, canh phải, `fmt(amount)`.
- Bỏ 2 cột "Phát sinh Nợ" / "Phát sinh Có" cũ.

### 3. Footer tổng cộng
Card subtitle và mọi hiển thị `Tổng Nợ / Tổng Có` đổi thành **Tổng số tiền** = tổng `amount` của các phiếu trong trang.

### 4. Không đổi
- Bộ lọc (DateRange, Dimensions, accountPrefix, source, voucherTypes, search) giữ nguyên.
- Phân trang giữ nguyên (server vẫn trả về theo line, nhưng UI hiển thị số phiếu sau khi gộp — cập nhật subtitle để rõ).
- Export Excel (`exportVoucherListXlsx`) **giữ nguyên định dạng cũ** (chi tiết theo line), vì đây là file kế toán cần đầy đủ — chỉ thay đổi hiển thị trên màn hình/in. (Có thể chỉnh sau nếu user yêu cầu.)

## Lưu ý kỹ thuật
- Vì server phân trang theo *line*, một phiếu có 2 line nếu rơi đúng ranh giới trang có thể bị tách. Trong thực tế cực hiếm với pageSize=100 và backend đã `ORDER BY entry_id`. Nếu cần chắc chắn 100%, có thể tăng pageSize mặc định hoặc thêm "fetch full entry" ở server — không nằm trong phạm vi sửa lần này, sẽ ghi chú TODO trong code.
