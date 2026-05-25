## Kế hoạch sửa Inbox AI

### 1. Sửa card không chuyển sang “Đã ghi sổ”
- Sửa `listInboxAi` để khi một `document` đã có quyết định `approve` trong `inbox_decisions`, item đó vẫn được trả về đúng trạng thái `posted` thay vì luôn tính lại từ `ocr_status`.
- Bổ sung `match_ref`/thông tin phiếu đã tạo cho item đã ghi sổ, ưu tiên:
  - `sales_vouchers` nếu là hóa đơn bán ra.
  - `purchase_vouchers` nếu là hóa đơn mua vào.
  - fallback về `journal_entry_id` nếu chưa có phiếu vật chất hóa.
- Tránh việc UI báo thành công nhưng refetch xong lại hiện “Sẵn sàng duyệt”.

### 2. Sửa cập nhật UI ngay sau khi bấm “Duyệt & ghi sổ”
- Cho `approveInboxItem` trả về thêm thông tin phiếu vừa tạo: loại phiếu, `voucher_id`, `voucher_no`, route mở phiếu.
- Sau mutation thành công, cập nhật cache của card đang mở và card trong danh sách thành `processing_status: "posted"`, gắn `match_ref`, đổi trạng thái hiển thị sang “Đã ghi sổ”.
- Không đóng sheet ngay lập tức nếu cần hiển thị nút mở phiếu sau ghi sổ; hoặc nếu vẫn đóng thì khi mở lại card sẽ thấy trạng thái đã ghi sổ.

### 3. Thêm nút “Xem Phiếu bán hàng / Phiếu mua hàng” trong Đề xuất Fin
- Trong `InboxItemSheet`, nếu item đã ghi sổ và có `proposal.voucher_kind`:
  - Hóa đơn bán ra: hiện nút `Xem Phiếu bán hàng` dẫn tới `/sales/vouchers`.
  - Hóa đơn mua vào: hiện nút `Xem Phiếu mua hàng` dẫn tới `/purchases/vouchers`.
- Truyền kèm search phù hợp để trang phiếu có thể lọc/đưa người dùng tới đúng phiếu nếu hiện tại route chưa hỗ trợ mở chi tiết theo ID.
- Giữ nút `Xem hoá đơn` hiện có.

### 4. Bổ sung cảnh báo cần tạo mới đối tác và hàng hóa/dịch vụ
- Mở rộng dữ liệu proposal/meta từ `buildDocumentItem`:
  - Hóa đơn bán ra: kiểm tra `customers` theo MST/tên; nếu chưa có thì thêm cảnh báo `Cần tạo mới Khách hàng <tên> vào hệ thống`.
  - Hóa đơn mua vào: kiểm tra `suppliers` theo MST/tên; nếu chưa có thì thêm cảnh báo `Cần tạo mới Nhà cung cấp <tên> vào hệ thống`.
  - Với từng dòng hàng/dịch vụ: kiểm tra `products` theo tên/mã; nếu chưa có thì thêm cảnh báo `Cần tạo mới Hàng hóa/Dịch vụ <tên> vào hệ thống`.
- Hiển thị các cảnh báo này trong `InboxItemSheet` thành khối riêng, dễ thấy, không trộn với bút toán.

### 5. Điều chỉnh nội dung hóa đơn bán ra trong Đề xuất Fin
- Với `MST người bán = MST DN`, giữ nhãn “Bán ra” màu xanh.
- Không hiển thị lại đoạn mô tả dài “Hoá đơn BÁN RA... Ghi nhận doanh thu 511 + VAT đầu ra 3331” trong phần reasoning theo yêu cầu.
- Vẫn giữ bút toán Nợ 131 / Có 511 / Có 3331 trong phần “Bút toán đề xuất”.

### 6. Kiểm tra dữ liệu thực tế sau sửa
- Dùng các bản ghi gần nhất như `1C26TYY_00000195.xml` và phiếu `BH2026-00007` để xác nhận:
  - Card hiển thị “Đã ghi sổ”.
  - Mở card thấy nút `Xem Phiếu bán hàng`.
  - Phiếu bán hàng vẫn tồn tại ở tab Phiếu bán hàng.
  - Cảnh báo tạo mới khách hàng/hàng hóa chỉ xuất hiện khi thật sự chưa có trong hệ thống.

## Files dự kiến sửa
- `src/lib/ai/inbox-types.ts`
- `src/lib/ai/inbox-reason.server.ts`
- `src/lib/inbox-ai.functions.ts`
- `src/routes/_app/inbox.tsx`
- `src/components/inbox/inbox-item-sheet.tsx`

## Không làm trong scope này
- Không đổi lại logic đánh số phiếu bán hàng đã chuẩn hóa.
- Không tạo thêm bảng mới nếu metadata hiện tại đủ dùng.
- Không thay đổi luồng ghi sổ phiếu bán/mua ngoài Inbox AI.