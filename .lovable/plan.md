## Mục tiêu
Trong Inbox AI, khi một mục đã được nhấn "Duyệt & ghi sổ" và xử lý thành công (`processing_status === "posted"`), nút chính trong sheet chi tiết cần đổi trạng thái để phản ánh điều đó — thay vì vẫn hiển thị "Duyệt & ghi sổ" như cần xử lý.

## Vấn đề hiện tại
- `InboxItemSheet` / `InboxItemDetail` chỉ nhận prop `approving` (boolean đang loading) và không kiểm tra `item.processing_status`.
- Sau khi `approveInboxItem` thành công, `inbox.tsx` cập nhật `processing_status: "posted"` vào cache + `sheetItem`, nhưng UI footer vẫn render nút "Duyệt & ghi sổ" bình thường.

## Giải pháp
Sửa footer của `InboxItemDetail` trong `src/components/inbox/inbox-item-sheet.tsx`:

1. **Nút chính thay đổi theo trạng thái:**
   - Nếu `item.processing_status === "posted"`:
     - Text: "Đã ghi sổ"
     - Icon: `Archive` (hoặc `CheckCircle2`)
     - Style: màu emerald/slate thay vì primary gradient
     - `disabled=true`
   - Nếu đang loading (`approving`): giữ spinner + text "Đang ghi sổ..."
   - Mặc định: "Duyệt & ghi sổ" như hiện tại.

2. **Thêm nút "Xem phiếu" khi đã ghi sổ:**
   - Khi `item.posted_voucher` tồn tại, hiển thị nút nhỏ bên cạnh (hoặc thay thế nút Sửa) để điều hướng đến:
     - `/purchases/vouchers` nếu `posted_voucher.kind === "purchase_voucher"`
     - `/sales/vouchers` nếu `posted_voucher.kind === "sales_voucher"`
   - Dùng `useNavigate` đã có sẵn trong component.

3. **Nút phụ điều chỉnh:**
   - Khi đã posted, ẩn nút "Bỏ qua" hoặc đổi thành nút đóng sheet, vì không còn ý nghĩa.

## File cần sửa
- `src/components/inbox/inbox-item-sheet.tsx` — sửa footer `InboxItemDetail`
- Không cần sửa `inbox.tsx` vì state `processing_status` và `posted_voucher` đã được cập nhật đúng trong `onSuccess` của `approveM`.

## Kết quả mong đợi
- Người dùng mở sheet một mục đã ghi sổ → thấy nút "Đã ghi sổ" (disabled, màu xanh xám) + nút "Xem phiếu" để kiểm tra phiếu vừa tạo.
- Không còn hiển thị "Duyệt & ghi sổ" cho các mục đã xử lý xong.