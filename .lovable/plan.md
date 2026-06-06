Mình kiểm tra kỹ rồi: hiện tại không còn guard route `requireSuperadminGuard`, nhưng trang `/superadmin` vẫn gọi `listAllTenants()` ngay khi mở trang. Server function này vẫn chạy `assertSuperadmin()` trước khi trả dữ liệu, nên UI bị giữ ở trạng thái tải danh sách và người dùng vẫn cảm giác app đang “xác thực quyền”.

Kế hoạch sửa:

1. Bỏ xác thực Super Admin tự động khi mở trang tổng quan
- Không gọi `listAllTenants()` ở màn `/superadmin` nữa.
- Trang tổng quan sẽ render ngay, không có loading table kiểu “Đang tải danh sách tenant…”.
- Giữ đúng yêu cầu: chỉ ai có menu Super Admin thì vào được từ Profile/menu; không thêm màn chờ xác thực quyền.

2. Chuyển dữ liệu danh sách tenant sang trang Tổ chức
- `/superadmin/organizations` mới là nơi cần tải danh sách tenant thật.
- Trang tổng quan `/superadmin` chỉ hiển thị các lối tắt/quản trị nhanh hoặc trạng thái rỗng, không block bằng quyền.

3. Loại các loading/permission text gây hiểu nhầm trong Super Admin
- Thay mọi `Đang tải…` chung chung trong các route Super Admin bằng skeleton hoặc text nghiệp vụ cụ thể.
- Không dùng lại câu “Đang xác thực quyền Super Admin”.

4. Kiểm tra lại quyền hiển thị menu Profile/Sidebar
- `useCurrentUser()` vẫn chỉ dùng để quyết định có hiện mục `Super Admin` hay không.
- Không dùng hook này để chặn/render màn xác thực khi đã ở trong Super Admin.

5. Xác minh sau sửa
- Search toàn repo đảm bảo không còn text `Đang xác thực quyền Super Admin` và không còn route guard cũ.
- Mở `/superadmin` trên preview, xác nhận trang render ngay và không còn trạng thái đang xác thực/tải quyền.