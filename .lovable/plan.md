## Kết quả kiểm tra

- Lovable Cloud đang hoạt động bình thường; không thấy dấu hiệu backend bị lỗi.
- Nút **Tổ chức** chậm vì `TenantSwitcher` đang gọi server function `listMyTenants` sau khi trang render; request thực tế mất khoảng **1.0–1.3s**.
- Trên trang `/invoices`, cùng lúc còn có nhiều request khác chạy song song: kiểm tra user nhiều lần, profile/user roles lặp, danh sách hóa đơn, nhà cung cấp, sản phẩm. Việc này làm phần header giữ trạng thái **“Đang tải…”** lâu hơn cảm nhận thực tế.
- Code hiện tại đã cache `my-tenants` 60 giây, nhưng cache chỉ có hiệu lực sau lần tải đầu; chưa có dữ liệu khởi tạo nhanh từ session/local cache.
- Một nguyên nhân phụ là các component `AppHeader` và `AppSidebar` tự gọi `supabase.auth.getUser()`/profile/roles riêng biệt, tạo nhiều request xác thực/profile trùng nhau khi vào app.

## Kế hoạch xử lý dứt điểm

1. **Tạo nguồn dữ liệu session/profile dùng chung**
   - Thêm query/hook dùng chung cho current user, profile cơ bản và role.
   - `AppHeader` và `AppSidebar` dùng lại cache này thay vì tự gọi `getUser()` riêng.
   - Mục tiêu: giảm các request `/auth/v1/user`, `profiles`, `user_roles` bị lặp.

2. **Làm TenantSwitcher hiển thị tức thì hơn**
   - Lưu tổ chức active gần nhất vào cache trình duyệt sau khi tải thành công.
   - Khi mở app, hiển thị ngay tên tổ chức từ cache trong lúc server xác nhận lại.
   - Giữ request thật để đảm bảo dữ liệu đúng, nhưng không để UI bị kẹt ở “Đang tải…” nếu đã có tổ chức gần nhất.

3. **Tối ưu server function `listMyTenants`**
   - Chạy truy vấn memberships và profile song song thay vì tuần tự.
   - Chỉ select đúng trường cần thiết.
   - Nếu cần, đổi sang dùng server-side/admin read an toàn cho phần đọc danh sách tổ chức để tránh overhead RLS không cần thiết, vẫn dựa trên userId đã xác thực từ middleware.

4. **Thiết lập cache mặc định hợp lý cho TanStack Query**
   - Cấu hình `QueryClient` có `staleTime`, `gcTime`, `refetchOnWindowFocus: false`, retry nhẹ.
   - Các query danh mục như suppliers/products/tenants không refetch lại liên tục khi chuyển trang.

5. **Tối ưu riêng trang hóa đơn**
   - Thêm `staleTime` cho `purchase-invoices`, `suppliers`, `products`.
   - Cân nhắc chỉ tải `suppliers/products` khi form nhập tay mở, thay vì luôn tải ngay khi vào trang.

6. **Kiểm tra sau khi sửa**
   - Vào lại `/invoices`, đo network/performance.
   - Kỳ vọng: số request auth/profile giảm rõ rệt, nút Tổ chức có tên gần như ngay lập tức sau lần tải đầu, và request `listMyTenants` không còn chặn cảm nhận UI.

## Ghi chú kỹ thuật

- Không cần thay đổi giao diện lớn.
- Có thể cần một migration nhỏ nếu kiểm tra thêm cho thấy thiếu index tối ưu theo `tenant_members(user_id, status)` hoặc bảng hóa đơn cần index theo ngày/trạng thái; hiện tại phần tổ chức có index cơ bản nhưng chưa tối ưu hoàn toàn cho filter `user_id + status`.