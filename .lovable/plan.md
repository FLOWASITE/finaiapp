## Cập nhật Logo FinAI theo ảnh tham chiếu

Thay wordmark "FinAI" hiện tại (text thường, 1 màu trắng) bằng logo mới theo phong cách ảnh upload:
- **"Fin"** màu trắng, font rounded (bo tròn mạnh các đầu nét)
- **"AI"** màu xanh dương (#3B82F6 / primary), chữ "A" cách điệu thành hình đỉnh núi/tam giác không có gạch ngang, "I" là một cột dọc bo tròn 2 đầu
- Tất cả nét có `stroke-linecap: round`, độ dày đồng đều
- Áp dụng ở **cả 2 chỗ**: header trái desktop và header mobile

### Cách thực hiện
Tạo component `src/components/FinAILogo.tsx` — một SVG inline:
- Vẽ "Fin" bằng path/text với font rounded (hoặc dựng bằng các đường stroke bo tròn)
- Vẽ "A" dạng 2 nét chéo gặp nhau ở đỉnh (không có thanh ngang), "I" dạng đường thẳng đứng — cả hai stroke màu `hsl(var(--primary))` / xanh
- Props: `className`, `height` (mặc định 40) để tái sử dụng kích thước khác nhau ở desktop vs mobile

Sau đó trong `src/routes/login.tsx`:
- Thay block wordmark "FinAI" desktop (panel trái) bằng `<FinAILogo height={44} />`
- Thay wordmark "FinAI" mobile header bằng `<FinAILogo height={32} />`

### Phạm vi
- Tạo: `src/components/FinAILogo.tsx`
- Sửa: `src/routes/login.tsx` (chỉ thay phần render logo)
- Không đổi: layout, màu nền, form đăng nhập, logic auth, các route/file khác
