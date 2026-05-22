## Mục tiêu

Đổi giao diện trang `/login` sang style giống ảnh mẫu: một thẻ (card) nổi ở giữa nền gradient tím-xanh, chia 2 nửa:
- **Nửa trái**: panel gradient xanh đậm với logo FinAI ở góc trên, tiêu đề lớn "Xin chào, mừng bạn!", mô tả ngắn, nút "Tìm hiểu thêm" (link sang `/welcome`).
- **Nửa phải**: nền trắng, các input "pill" bo tròn lớn với icon vuông pastel bên trái, nút **Đăng nhập** trắng có chữ xanh đậm, dòng "Chưa có tài khoản?" và nút **Đăng ký** gradient xanh lam→cyan.

## Thay đổi

### 1. `src/routes/login.tsx` — viết lại layout (chỉ UI, giữ nguyên logic)

Giữ nguyên 100% logic: `onSubmit`, `handleForgot`, `validate`, `mapAuthError`, state `email/password/showPw/loading/...`, search params, redirect đích. Chỉ thay phần JSX `return (...)`.

**Cấu trúc JSX mới:**
```
<div min-h-screen, background = gradient tím nhạt (var --gradient-login-bg)>
  <div card max-w-5xl, rounded-2xl, shadow-2xl, overflow-hidden, grid lg:grid-cols-2>

    <aside> // panel trái — hiện trên lg, ẩn trên mobile
      background = gradient xanh đậm (navy → blue)
      + overlay núi/hình radial nhẹ (pseudo / SVG inline)
      - Logo FinAI góc trên trái
      - Tiêu đề: "Xin chào,\nmừng bạn!" (text-5xl, font-bold, leading-tight)
      - Mô tả 2 dòng về FinAI
      - Nút pill trắng "Tìm hiểu thêm" → Link /welcome
    </aside>

    <main> // panel phải
      - Mobile: hiện logo nhỏ + tiêu đề "Xin chào, mừng bạn!"
      - Mode switcher pill (giữ nguyên)
      - Form:
        * Input Email: pill rounded-xl h-14, icon Mail trong ô vuông pastel
          bên trái, label "Email" nhỏ phía trên placeholder bên trong input
        * Input Password: tương tự với icon Lock, nút Eye bên phải
        * Hàng "Remember me" checkbox bên trái + "Quên mật khẩu?" bên phải
        * Nút Login: nền trắng, border, text xanh đậm, rounded-xl, h-14,
          shadow lớn — thay vì variant default
        * Dòng "Chưa có tài khoản?" căn giữa
        * Nút Sign up: gradient cyan → blue (var --gradient-signup-btn),
          rounded-xl, h-14, full-width — toggle isSignup hoặc submit khi đang ở
          mode signup
      - Giữ nguyên error alert, password strength meter, terms text
    </main>
  </div>
</div>
```

**Hành vi 2 nút:**
- Khi `!isSignup` (login mode): nút trắng "Đăng nhập" là submit; nút gradient "Đăng ký" chỉ chuyển sang signup mode.
- Khi `isSignup`: ngược lại — nút trắng "Đăng nhập" chuyển về login mode; nút gradient "Tạo tài khoản" là submit.

### 2. `src/styles.css` — thêm tokens

Thêm vào `:root` (và dark mode nếu cần):
```css
--gradient-login-bg: linear-gradient(135deg, oklch(0.78 0.10 300), oklch(0.82 0.08 250));
--gradient-login-panel: linear-gradient(160deg, oklch(0.55 0.18 250) 0%, oklch(0.32 0.12 260) 60%, oklch(0.22 0.08 265) 100%);
--gradient-signup-btn: linear-gradient(90deg, oklch(0.78 0.14 220), oklch(0.62 0.18 250));
```

## Ghi chú

- Không đụng tới logic auth/Supabase, không đụng `welcome.tsx`, không đụng `__root.tsx` hay routing.
- Vẫn dùng `Input`, `Label`, `Button` từ shadcn — chỉ thêm className để bo tròn lớn + cao hơn.
- Responsive: dưới `lg`, ẩn panel trái, panel phải full-width trong card.
