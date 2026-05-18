## Mục tiêu

Hiện tại việc khai báo tài khoản TCT đang nằm chung trong dialog "Đồng bộ HĐĐT" (tab "Tài khoản TCT"). Người dùng không thấy ngay trạng thái đăng nhập, không có chỗ rõ ràng để cập nhật và sidebar chưa có lối vào riêng. Kế hoạch này tách phần khai báo thành 1 trang chuyên biệt và bổ sung các thao tác còn thiếu.

## Phạm vi thay đổi

### 1. Trang mới `/einvoices/credentials`
File: `src/routes/_app/einvoices/credentials.tsx`

Hiển thị:
- **Trạng thái hiện tại**: tên đăng nhập (MST), lần đăng nhập gần nhất (`last_login_at`), thời điểm cập nhật.
- **Form khai báo**:
  - Tên đăng nhập TCT (mặc định lấy MST của tenant đang chọn, cho phép sửa).
  - Mật khẩu (input password, có nút hiện/ẩn).
  - Nút **Lưu** (gọi `saveTctCredentials`).
  - Nút **Kiểm tra kết nối** (chỉ enable khi đã lưu) — gọi server fn mới `testTctLogin` (xem mục 3).
  - Nút **Xoá tài khoản** (confirm) — gọi `deleteTctCredentials`.
- **Hướng dẫn ngắn**: mật khẩu được mã hoá AES-GCM trước khi lưu, chỉ chủ tài khoản tenant đọc được.
- Khi chưa chọn tenant: thông báo + link tới chọn tổ chức.

### 2. Cập nhật sidebar
File: `src/components/app-sidebar.tsx`

Trong nhóm "Hoá đơn điện tử" của `EINVOICE_SECTIONS`, thêm entry:
- `{ to: "/einvoices/credentials", label: "Thông tin đăng nhập TCT", icon: KeyRound }`

### 3. Server function `testTctLogin`
File: `src/lib/einvoices-sync.functions.ts`

- Mới: `testTctLogin = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])`
- Lấy credentials theo tenant, giải mã mật khẩu, lấy captcha → trả về `{ captchaKey, captchaSvg }` cho FE.
- FE nhập captcha → gọi tiếp `verifyTctLogin({ captchaKey, captchaValue })`: thực hiện `loginTct(...)`, cập nhật `einvoice_credentials.last_login_at = now()` khi thành công, trả về `{ ok: true }` hoặc throw lỗi rõ ràng (sai captcha / sai mật khẩu / TCT không phản hồi).
- Bọc try/catch giống `getTctCaptcha` để không trả 500 trắng màn hình.

### 4. Dialog "Đồng bộ HĐĐT" gọn lại
File: `src/components/sync-tct-dialog.tsx`

- Bỏ tab "Tài khoản TCT" khỏi dialog (chỉ còn phần Đồng bộ).
- Khi `hasCreds = false`: hiển thị banner "Bạn chưa khai báo tài khoản TCT" + nút điều hướng tới `/einvoices/credentials`.
- Mọi import/state liên quan tới save/delete bỏ đi.

### 5. Cập nhật điều hướng phụ
- Trên `src/routes/_app/einvoices/index.tsx`, nút header "Tài khoản TCT" (nếu có) trỏ về `/einvoices/credentials`. Nếu chưa có, thêm 1 nút phụ bên cạnh "Đồng bộ".

## Lưu ý kỹ thuật

- Dùng `useServerFn` + React Query, invalidate `["tct-creds"]` sau khi lưu/xoá.
- Validation client + server (zod đã có sẵn ở `saveTctCredentials`).
- Không log mật khẩu ra console.
- Trang dùng layout `_app` sẵn có, không tạo layout mới.
- Không đổi schema DB — `einvoice_credentials` đã đủ cột (`tct_username`, `tct_password_encrypted`, `last_login_at`, `updated_at`).

## File sẽ chỉnh

- Tạo: `src/routes/_app/einvoices/credentials.tsx`
- Sửa: `src/components/app-sidebar.tsx`, `src/components/sync-tct-dialog.tsx`, `src/lib/einvoices-sync.functions.ts`, `src/routes/_app/einvoices/index.tsx`

## Câu hỏi xác nhận

1. Có cần nút "Kiểm tra kết nối" (gọi thật lên TCT để verify mật khẩu) ngay trong scope này không? Mặc định: **có**, vì đây là cách duy nhất chắc chắn mật khẩu lưu đúng.
2. Có cần hỗ trợ nhiều tài khoản TCT trên cùng 1 tenant (ví dụ MST chi nhánh) không? Mặc định: **không** — giữ 1 record / tenant như hiện tại.