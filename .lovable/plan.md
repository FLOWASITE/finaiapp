## Mục tiêu
Khi TCT trả về captcha (SVG), hiển thị rõ nét, sắc cạnh hơn và cho phép user phóng to để nhìn ký tự khó. Áp dụng đồng nhất cho 2 nơi đang nhập captcha.

## Phạm vi thay đổi (chỉ frontend)
1. Tạo component dùng chung `src/components/tct-captcha.tsx`:
   - Props: `svg`, `loading`, `onReload`.
   - Render captcha bằng cách convert chuỗi SVG → `data:image/svg+xml;base64,...` rồi đặt trong `<img>` (thay vì `dangerouslySetInnerHTML`). Lợi ích:
     - SVG được scale mượt như ảnh, không bị méo khi phóng to.
     - Tránh chèn raw SVG vào DOM (an toàn hơn, ít rủi ro CSS leak).
   - Khung hiển thị: nền trắng cố định (để dark mode vẫn đọc được), `image-rendering: crisp-edges`, scale ×1.6 so với kích thước gốc cho rõ nét hơn.
   - Nút **Tải lại** (icon `RefreshCw`, spin khi `loading`).
   - Nút **Phóng to** (icon `ZoomIn`) mở `Dialog` shadcn hiển thị captcha ở kích thước lớn (×3), kèm nút Tải lại trong dialog.
   - Trạng thái rỗng: skeleton/placeholder thay vì khung trắng trống.

2. Cập nhật `src/routes/_app/einvoices/credentials.tsx`:
   - Thay block hiện tại (div + `dangerouslySetInnerHTML` + nút Tải lại tách rời) bằng `<TctCaptcha svg={cap?.svg} loading={capLoading} onReload={loadCaptcha} />`.
   - Giữ nguyên `Input` nhập mã + logic `verifyMut`.

3. Cập nhật `src/components/sync-tct-dialog.tsx`:
   - Thay block captcha tương tự bằng `<TctCaptcha .../>`.
   - Giữ nguyên logic mode `manual/auto`.

## Không thay đổi
- Server function `getTctCaptcha` (vẫn trả `{ key, svg }` từ TCT) — không cần convert PNG ở server vì `sharp`/`canvas` không chạy trên Cloudflare Worker.
- Luồng auto 2Captcha, verify login, sync.
- Schema DB, secrets, proxy TCT.

## Ghi chú kỹ thuật
- Convert base64 dùng `btoa(unescape(encodeURIComponent(svg)))` để an toàn với ký tự Unicode.
- `<img>` đặt `alt="captcha"`, `draggable={false}`, `select-none`.
- Dialog phóng to dùng `Dialog`/`DialogContent` đã có sẵn (shadcn), không thêm dependency.

## Kiểm thử
- Mở `/einvoices/credentials` → bấm "Kiểm tra kết nối" → captcha hiện rõ; bấm phóng to → ảnh lớn hơn vẫn nét; bấm Tải lại → captcha mới.
- Mở dialog Đồng bộ HĐĐT (mode manual) → captcha render giống nhau.
