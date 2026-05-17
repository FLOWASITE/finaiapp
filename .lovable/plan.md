# Bổ sung Super-admin UI & Chấp nhận lời mời

Hoàn thiện 2 mảnh còn thiếu trong Phân hệ Admin theo plan ban đầu.

## 1. Trang chấp nhận lời mời `/invite/$token`

Route công khai (không nằm trong `_app`), hiển thị thông tin lời mời và cho phép người nhận chấp nhận sau khi đăng nhập/đăng ký.

**Server functions mới** (`src/lib/invitations.functions.ts`):
- `getInvitationByToken({ token })` — trả về email, role, công ty mời, hạn dùng. Public (không middleware), dùng `supabaseAdmin` chỉ select theo token + chưa accepted + chưa hết hạn.
- `acceptInvitation({ token })` — yêu cầu auth; verify token hợp lệ, email khớp `auth.jwt().email`, insert `user_roles(user_id, role)`, đánh dấu `accepted_at/accepted_by`.

**UI** (`src/routes/invite.$token.tsx`):
- Hiển thị: "Bạn được mời làm {role} tại công ty …"
- Nếu chưa đăng nhập → nút "Đăng nhập để chấp nhận" (redirect kèm `?next=/invite/<token>`).
- Nếu đã đăng nhập đúng email → nút "Chấp nhận lời mời" → gọi `acceptInvitation` → redirect `/dashboard`.
- Xử lý các trạng thái: hết hạn, đã chấp nhận, sai email, không tìm thấy.

**Login route**: hỗ trợ tham số `next` để quay lại trang invite sau khi đăng nhập.

## 2. Super-admin UI

Layout + 2 trang, guard bằng `is_superadmin`.

**Layout** (`src/routes/_app/superadmin.tsx`):
- `beforeLoad`: kiểm tra user có role `superadmin`, nếu không → redirect `/dashboard`.
- Tab nav: Tenants.

**Trang danh sách** (`src/routes/_app/superadmin/index.tsx`):
- Bảng tenants từ `listAllTenants` (đã có): Email · Công ty · MST · Roles · #Hoá đơn mua · #Hoá đơn bán · #Bút toán · Ngày tạo.
- Tìm kiếm theo email/công ty. Mỗi dòng → link sang `/superadmin/tenant/$id`.

**Trang chi tiết tenant** (`src/routes/_app/superadmin/tenant.$id.tsx`):
- Dùng `getTenantDetail` (đã có): hồ sơ, danh sách roles, 50 audit gần nhất, danh sách khóa kỳ.
- Nút toggle "Cấp/Thu hồi Super-admin" → `setSuperadminRole` (đã có).

**Sidebar** (`src/components/app-sidebar.tsx`):
- Thêm mục "Super Admin" trong nhóm "Hệ thống", chỉ hiển thị khi user có role `superadmin` (query `user_roles` 1 lần khi mount, cache trong state).

## 3. Tiện ích nhỏ

- Trong trang `/admin/members`, sau khi tạo invitation hiển thị link `/invite/{token}` để owner copy gửi tay (chưa có email transactional).
- Bootstrap super-admin: cung cấp SQL helper trong UI (hoặc tài liệu) để promote user đầu tiên thành `superadmin` — sẽ làm bằng nút trong trang chi tiết tenant (super-admin hiện có cấp cho người khác). Lần đầu cần thực hiện thủ công qua migration helper hoặc qua trang admin/members (owner tự cấp role `superadmin` cho chính mình bằng cách thêm option vào dropdown role).

## Files sẽ tạo/sửa

- thêm: `src/lib/invitations.functions.ts`
- thêm: `src/routes/invite.$token.tsx`
- thêm: `src/routes/_app/superadmin.tsx`
- thêm: `src/routes/_app/superadmin/index.tsx`
- thêm: `src/routes/_app/superadmin/tenant.$id.tsx`
- sửa: `src/components/app-sidebar.tsx` (thêm mục Super Admin có điều kiện)
- sửa: `src/routes/_app/admin/members.tsx` (hiển thị link invite)
- sửa: `src/routes/login.tsx` (hỗ trợ `?next=`)

Không cần migration mới — schema `user_invitations`, `user_roles`, RLS đã sẵn sàng.
