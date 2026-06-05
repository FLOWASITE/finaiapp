## Kết luận kiểm tra

Code hiện tại không còn chuỗi `Đang xác thực quyền Super Admin` và không còn `requireSuperadminGuard` trong route Super Admin. Preview `/superadmin` đang render được trang Super Admin, nhưng vẫn còn các trạng thái `Đang tải…` ở:

- Nút chọn tổ chức trên header (`TenantSwitcher`).
- Bảng danh sách tenant của trang Super Admin (`TenantsPage`).
- Console có lỗi router preload: `Cannot read properties of undefined (reading '_nonReactive')`, có thể làm navigation/preload bị kẹt hoặc hiển thị loading sai.

## Plan sửa dứt điểm

1. **Ẩn TenantSwitcher khi ở Super Admin**
   - Trong layout app, không render `TenantSwitcher` trên route `/superadmin`.
   - Super Admin là quản trị toàn hệ thống, không cần chọn tenant hiện tại; việc này loại bỏ nút `Đang tải…` trên header mà user đang thấy như “đang xác thực”.

2. **Đổi loading bảng Super Admin thành nội dung trung tính**
   - Trang `/superadmin` vẫn cần gọi backend để lấy danh sách tenant.
   - Đổi text trong bảng từ `Đang tải…` sang trạng thái rõ nghĩa như `Đang tải danh sách tenant…`, không dùng từ “xác thực/quyền”.

3. **Sửa route index redirect dùng navigation của TanStack**
   - `src/routes/index.tsx` đang dùng `window.location.replace` trong fallback.
   - Đổi fallback sang `useNavigate` để tránh router state/preload bị lệch, liên quan lỗi `_nonReactive`.

4. **Kiểm tra lại sau sửa**
   - Search toàn repo xác nhận không có `Đang xác thực quyền Super Admin` / `requireSuperadminGuard`.
   - Mở `/superadmin` trên preview xác nhận không còn nút header `Đang tải…` và page render thẳng layout Super Admin.