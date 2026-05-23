## Mục tiêu
Thay logo "FinAI" hiện đang vẽ bằng SVG/text trong `src/components/FinAILogo.tsx` bằng ảnh logo người dùng vừa tải lên (file `ChatGPT_Image_11_48_10_23_thg_5_2026_1.png`).

## Các bước thực hiện

1. **Copy ảnh logo vào project**
   - Lưu bản gốc (nền trắng, full màu) vào `src/assets/finai-logo.png` — dùng cho header/mobile (nền sáng).
   - Tạo thêm bản dành cho nền tối (panel trái màn hình login) — vì logo gốc có chữ "Fin" màu rất nhạt sẽ chìm trên nền sáng và sẽ nổi trên nền tối. Lưu bản này thành `src/assets/finai-logo-dark-bg.png` (dùng đúng ảnh gốc, vì nền trắng của ảnh sẽ bị xử lý bằng `mix-blend-mode` hoặc dùng phiên bản trong suốt).
   - Phương án đơn giản và an toàn nhất: dùng cùng một file ảnh `finai-logo.png`, và:
     - Trên panel nền tối (login bên trái): bọc trong khối nền trắng bo tròn nhỏ để logo hiển thị đúng màu thương hiệu.
     - Trên mobile header / nơi nền sáng: hiển thị trực tiếp.

2. **Cập nhật `src/components/FinAILogo.tsx`**
   - Bỏ phần SVG + text hiện tại.
   - Import ảnh `@/assets/finai-logo.png`.
   - Render `<img>` với:
     - `height` theo prop (mặc định 40).
     - `width` auto (`width: "auto"`).
     - `alt="FinAI"`.
     - `draggable={false}`, `className` truyền tiếp.
   - Giữ nguyên signature props để không phải sửa nơi gọi (`height`, `className`). Hai props `finColor` / `aiColor` không còn tác dụng → giữ lại trong interface để tương thích nhưng không dùng (tránh phá API).

3. **Cập nhật `src/routes/login.tsx`** (chỉ phần hiển thị, không đụng logic auth)
   - **Panel trái (nền gradient tối)**: bọc `<FinAILogo height={40} />` trong một khối `rounded-xl bg-white/95 px-3 py-2 shadow-sm` để logo luôn rõ nét trên nền tối.
   - **Header mobile (nền card sáng)**: dùng trực tiếp `<FinAILogo height={32} />`, không cần khối nền.

4. **Không thay đổi**
   - Logic đăng nhập, route guard, gradient nền, typography của khối "Sổ kế toán / Phần mềm / Agent".
   - Không xoá file `FinAILogo.tsx`, chỉ thay nội dung bên trong.

## Chi tiết kỹ thuật

- File mới: `src/assets/finai-logo.png` (copy từ `user-uploads://ChatGPT_Image_11_48_10_23_thg_5_2026_1.png`).
- Sửa: `src/components/FinAILogo.tsx`, `src/routes/login.tsx` (chỉ 2 chỗ render logo).
- Ảnh tỉ lệ ~3.4:1 (giống viewBox hiện tại) nên kích thước hiển thị sẽ tương đương, không phá layout.
- Vì logo gốc nền trắng, cần khối nền trắng bo góc ở panel tối để tránh chữ "Fin" (vốn rất nhạt) bị chìm.
