# Xác nhận trước khi "Duyệt nhanh tin cậy cao"

## Thay đổi

Trong `src/routes/_app/inbox.tsx`:

1. Thêm state `confirmBulkOpen: boolean`.
2. Tách `approveAllHigh` thành 2 phần:
   - `requestApproveAllHigh()` — chỉ kiểm tra `highCount > 0` rồi `setConfirmBulkOpen(true)` (nếu 0 thì giữ toast "Không có mục…").
   - `runApproveAllHigh()` — giữ nguyên logic vòng lặp duyệt + toast progress hiện tại.
3. Nút **"Duyệt tất cả tin cậy cao (N)"** đổi `onClick` sang `requestApproveAllHigh`.
4. Render `<AlertDialog>` (đã có `src/components/ui/alert-dialog.tsx`) ở cuối page:
   - Title: **"Duyệt nhanh {highCount} mục tin cậy cao?"**
   - Description liệt kê tóm tắt: tổng số mục, tổng tiền tuyệt đối (`Σ |amount|`), và 3 mục đầu (title · partner · amount) + "và N mục khác" khi cần — để user nhìn thấy mình sắp ghi sổ gì.
   - Cảnh báo nhỏ: "Hành động này sẽ tạo bút toán và không thể hoàn tác nhanh."
   - Cancel: "Để xem lại"
   - Action: "Duyệt {N} mục" (variant primary/emerald) → đóng dialog rồi gọi `runApproveAllHigh`.
5. Không đổi luồng duyệt từng mục trong `InboxItemSheet` (đã có nút Approve rõ ràng, không cần confirm thêm).

## Out of scope

- Không thêm tuỳ chọn "Đừng hỏi lại" (có thể thêm sau bằng localStorage nếu user muốn).
- Không đổi thiết kế header / nút bấm.
