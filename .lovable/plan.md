## Mục tiêu
Không còn màn hình/trạng thái “Đang xác thực quyền Super Admin”. Người dùng chỉ vào Super Admin bằng link đã được ẩn/hiện trong Menu Profile dựa trên role `superadmin`.

## Thay đổi sẽ làm
1. **Bỏ route guard Super Admin ở UI**
   - Gỡ `beforeLoad: requireSuperadminGuard` khỏi layout `/superadmin` và toàn bộ page con trong `src/routes/_app/superadmin/*`.
   - Điều này loại bỏ hoàn toàn bước xác thực quyền ở navigation nên không còn kẹt loading/timeout guard.

2. **Giữ điều kiện hiển thị menu Profile**
   - Giữ logic hiện tại: chỉ khi `useCurrentUser()` trả về `isSuperadmin === true` thì Profile menu mới có mục **Super Admin**.
   - Không thêm popup, spinner, hay thông báo “đang xác thực”.

3. **Không đụng bảo mật server functions**
   - Các hàm server Super Admin hiện vẫn tự kiểm tra role `superadmin` trong backend trước khi trả dữ liệu/thực hiện hành động.
   - Vì vậy việc bỏ guard UI chỉ bỏ lớp xác thực thừa gây kẹt, không mở dữ liệu Super Admin cho user thường.

4. **Dọn file guard nếu không còn dùng**
   - Nếu sau khi gỡ import không còn nơi nào dùng `requireSuperadminGuard`, sẽ xóa hoặc để lại không import tùy mức an toàn tối thiểu.

## Kiểm tra sau khi sửa
- Search chắc chắn không còn `requireSuperadminGuard` trong route Super Admin.
- Xác nhận không còn text “Đang xác thực quyền Super Admin”.
- Vào `/superadmin` xem page render thẳng nội dung hoặc server function trả lỗi rõ nếu backend chặn role.