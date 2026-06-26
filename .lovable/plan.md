## Mục tiêu
Đưa màn hình **Phiếu nhập/xuất kho** (`src/components/inventory/VoucherListPage.tsx`) về đúng chuẩn phần mềm kế toán (MISA/Fast): bộ lọc gọn, KPI súc tích, bảng dữ liệu dày đặc nhưng dễ đọc, đủ cột nghiệp vụ, có hành động hàng loạt.

## Thay đổi chính

### 1. Header / Toolbar
- Tiêu đề + mô tả thu nhỏ 1 dòng.
- Hàng nút bên phải: **Tạo phiếu nhập / Tạo phiếu xuất** (giữ), thêm **Xuất Excel**, **In danh sách**, **Làm mới**.
- Toolbar lọc dồn vào 1 thanh ngang (sticky) thay vì Card lớn: `[Kỳ] [Kho] [Loại] [Trạng thái] [Tìm kiếm] [Bộ lọc nâng cao ▾]`.
  - Bộ lọc nâng cao (popover): Chi nhánh, TK đối ứng, Đối tượng (party), Khoảng giá trị.

### 2. KPI rút gọn (1 hàng, nhỏ)
3 thẻ phẳng, mỗi thẻ 1 dòng `label — value`: Số phiếu · Tổng số dòng · Tổng giá trị. Bỏ icon hộp lớn.
Thêm so sánh "Nhập: x phiếu / Xuất: y phiếu" ở dòng phụ khi `type="all"`.

### 3. Bảng chuẩn kế toán
Cột (theo thứ tự, mật độ cao — `text-sm`, row height ~36px, zebra rows, sticky header):

```
[☐] | Ngày | Số phiếu | Loại | Kho | Đối tượng | Lý do/Diễn giải | TK đối ứng | Chứng từ gốc | SL dòng | Tổng giá trị | Trạng thái | …
```

- **Checkbox cột đầu** → chọn nhiều phiếu.
- **Số phiếu** click vào mở Chi tiết (thay cho icon mắt).
- **Loại**: badge Nhập (xanh) / Xuất (cam) / Chuyển kho (tím).
- **Đối tượng** (`party_name`) — cột mới, thường thấy trong PM kế toán.
- **TK đối ứng** (`counter_account`) hiển thị font mono.
- **Chứng từ gốc** (`source_doc_no` + `source_doc_date`) — cột mới.
- **Tổng giá trị** căn phải, tabular-nums, in đậm; tổng cột ở footer (`tfoot`) cộng dồn theo trang.
- **Trạng thái**: badge Đã ghi sổ (xanh đậm) / Chưa ghi sổ (xám viền) + icon đính kèm nếu `attachments_count > 0`.
- **Cột hành động** gom vào menu `⋯`: Xem · Sửa · In · Ghi sổ / Huỷ ghi sổ · Xoá.

### 4. Hàng loạt (bulk actions)
Khi chọn ≥ 1 phiếu, hiện thanh action nổi phía dưới:
`Đã chọn N phiếu  ·  [Ghi sổ] [Huỷ ghi sổ] [In hàng loạt] [Xoá]`.
(Frontend wiring; gọi server fn hiện có theo từng id, hiện toast tổng kết.)

### 5. Trạng thái rỗng & loading
- Rỗng: dùng `EmptyState` với mascot, mô tả + nút "Tạo phiếu nhập" / "Tạo phiếu xuất".
- Loading: skeleton rows thay vì text "Đang tải…".

### 6. Mobile
Dưới `md`: bảng chuyển sang danh sách card 2 dòng (số phiếu + loại + ngày | đối tượng + tổng giá trị + trạng thái), tap mở chi tiết.

### 7. Phân trang
Giữ `TablePagination`, thêm tuỳ chọn 20/50/100/200 dòng.

## Phạm vi
- Chỉ sửa frontend: `src/components/inventory/VoucherListPage.tsx` (+ tách 1–2 component con nếu file vượt 800 dòng: `VoucherTable`, `VoucherFilters`, `VoucherBulkBar`).
- Không đổi schema, không đổi server fn (`listStockVouchers` đã trả đủ trường cần dùng — chỉ thêm select `party_name, source_doc_no, source_doc_date, attachments_count, counter_account` nếu hiện tại chưa select).
- Nếu `listStockVouchers` chưa trả các cột mới, cập nhật `SELECT` trong `src/lib/inventory.functions.ts` (chỉ thêm trường, không đổi chữ ký).

## Ngoài phạm vi
- Không đổi luồng tạo/sửa phiếu (Dialog hiện tại giữ nguyên).
- Không thêm route mới.
- Không đụng tới phiếu chuyển kho riêng (sẽ làm sau).
