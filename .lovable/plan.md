## Mục tiêu

Hiện tại convert prospect bắt phải chọn 1 tenant FinAI đã có. Đổi flow: **mỗi khách hàng mới = 1 tenant FinAI mới**, văn phòng kế toán tự động được cấp quyền truy cập, và contact của khách có thể được mời để tự đăng nhập dùng FinAI.

## Thay đổi

### 1. Server fn `convertProspect` (src/lib/office/prospects.functions.ts)

Đổi input — bỏ `client_tenant_id` (bắt buộc), thêm:
- `tax_id`, `company_name`, `address`, `phone`, `email` (lấy mặc định từ prospect, cho phép sửa)
- `invite_contact_email?: string` — nếu có sẽ gửi lời mời role `owner` cho email này
- `fee_per_month?: number`, `display_name?: string`

Logic (dùng `supabaseAdmin` cho phần tạo tenant + invitation để bypass RLS):
1. Lấy prospect, kiểm tra chưa converted.
2. Tạo `tenants` mới: `name = prospect.name`, `owner_user_id = userId` (chủ văn phòng tạm thời là owner) — chuẩn theo flow tenant hiện tại.
3. Insert `tenant_members` cho userId hiện tại (admin/owner) để văn phòng quản lý được.
4. Insert `office_client_links` (agency_tenant_id = văn phòng, client_tenant_id = tenant mới).
5. Nếu `invite_contact_email`: insert `user_invitations` (role `owner`, tenant_id = tenant mới, tenant_owner_id = userId). Trả về token để FE hiển thị link mời (`/invite/:token`).
6. Update prospect: `status='won'`, `converted_tenant_id` = tenant mới.

### 2. Dialog `ProspectConvertDialog`

Bỏ phần tìm tenant FinAI. Thay bằng form gồm:
- Tên khách hàng (prefill từ prospect.name)
- MST, địa chỉ, điện thoại, email contact (prefill từ prospect)
- Phí dịch vụ / tháng
- Checkbox "Gửi lời mời đăng nhập cho contact" → nếu bật, dùng `email` để tạo invitation
- Sau khi thành công: toast + nếu có invitation token → hiển thị link `/invite/<token>` để chủ văn phòng copy gửi cho khách

### 3. Nút "Liên kết khách FinAI" cũ (ClientLinkDialog)

Giữ nguyên cho trường hợp khách đã có tenant FinAI từ trước (rare). Không xoá để tránh phá flow hiện hữu.

### 4. UI prospect detail / clients list

Không cần đổi route, chỉ dialog logic.

## File động chạm

- `src/lib/office/prospects.functions.ts` — rewrite `convertProspect`
- `src/components/office/prospect-convert-dialog.tsx` — rewrite form

## Ngoài phạm vi (không làm lần này)

- Không gửi email mời tự động (chỉ tạo invitation + show link); việc gửi email cần email infra riêng.
- Không đổi `ClientLinkDialog`.
- Không tạo seed dữ liệu kế toán mặc định cho tenant mới (dùng setup wizard sẵn có khi khách đăng nhập).
