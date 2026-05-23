## Mục tiêu

Cập nhật trang `/login` theo phong cách ảnh tham khảo: panel trái rỗng/thoáng với logo wordmark ở góc trên và khối tagline lớn ở góc dưới; panel phải giữ form đăng nhập hiện tại nhưng đổi tiêu đề. Giữ nguyên màu sắc, gradient và bố cục 2 cột (lg:grid-cols-2) hiện tại.

## Phạm vi

Chỉ sửa `src/routes/login.tsx` — phần frontend/presentation. Không đụng logic auth, validate, Supabase, hay file khác.

## Thay đổi cụ thể

### 1) Logo "FinAI" kiểu wordmark Jaz
- Thay khối logo hiện tại (ô vuông + chữ "A" + chữ "FinAI") ở cả panel trái (`lg:flex`) và header mobile (`lg:hidden`).
- Thành **wordmark đơn**: chỉ chữ `FinAI` cỡ lớn, font-weight 700–800, tracking hơi âm, màu trắng ở panel trái và `text-foreground` ở header mobile.
- Vị trí panel trái: góc trên-trái (đã đúng vị trí, chỉ đổi style).

### 2) Khối tagline lớn ở góc dưới-trái panel trái
Thay block `Xin chào, mừng bạn!` + mô tả + nút "Tìm hiểu thêm" bằng:

```
Sổ kế toán.
Phần mềm.
Agent.

Kiến tạo cho những người giữ cán cân tài chính.
```

- Heading: mỗi dòng 1 line, font-bold 5xl/6xl, leading rất chặt (≈1.0), tracking-tight, màu trắng.
- Sub-tagline: text-sm/base, `text-white/70`, đặt ngay dưới heading.
- Bỏ nút "Tìm hiểu thêm" và copyright footer để panel sạch như ảnh.
- Cấu trúc `justify-between` đổi thành layout: logo top-left + tagline bottom-left (dùng `mt-auto` cho khối tagline, bỏ phần tử giữa).
- Giữ nguyên 2 lớp SVG sóng + radial gradient overlay hiện tại (giữ "màu sắc và layout").

### 3) Panel phải
- Header mobile (`lg:hidden`) "Xin chào, mừng bạn!" đổi thành `Sổ kế toán. Phần mềm. Agent.` (1 dòng, nhỏ gọn hơn).
- Tiêu đề form: thêm dòng `Chào mừng đến FinAI` + sub `Đăng nhập hoặc tạo tài khoản bằng email` phía trên ô email (chỉ khi đang ở chế độ signin/signup mặc định — render trước `<form>`).
- Form email + mật khẩu + Ghi nhớ + Quên mật khẩu + nút Đăng nhập: **giữ nguyên hoàn toàn**.

### 4) Không thay đổi
- Logic `onSubmit`, `validate`, `mapAuthError`, `handleForgot`, redirect, timeout.
- Token màu trong `src/styles.css` (`--gradient-login-bg`, `--gradient-login-panel`).
- File khác trong dự án.

## Kết quả mong đợi
Trang login giữ tông xanh đậm/gradient hiện tại, panel trái trông tối giản kiểu Jaz với wordmark "FinAI" trên cùng và tagline tiếng Việt 3 dòng lớn ở dưới; form bên phải vẫn đầy đủ chức năng email + mật khẩu.
