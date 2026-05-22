## Kết luận kiểm tra

- Live sandbox vào được `/index` và tự chuyển sang `/login`, form login hiện bình thường.
- URL người dùng đang kẹt là `id-preview.../index?__lovable_sha=...`; đây là preview tĩnh/được auth-bridge bảo vệ, không cùng luồng với live sandbox.
- Code hiện đang xử lý `/index` bằng redirect HTML trong `src/server.ts`, nhưng route `/index` không tồn tại trong TanStack route tree. Cách này dễ lệch giữa live sandbox, preview tĩnh và published app.

## Kế hoạch sửa dứt điểm

1. **Thêm route thật cho `/index`**
   - Tạo route `src/routes/index_compat.tsx` hoặc file tương ứng khai báo `createFileRoute('/index')`.
   - Route này chỉ redirect sang `/login` hoặc `/dashboard` tùy session, giống logic trang `/`.
   - Như vậy preview mở `/index` sẽ được router xử lý chính thức, không phụ thuộc hack ở server wrapper.

2. **Đơn giản hóa redirect ở trang `/`**
   - Giữ fallback loading an toàn.
   - Chuyển logic redirect dùng `window.location.replace(...)` để tránh lỗi navigation/hydration khi chưa có session.

3. **Gỡ redirect đặc biệt `/index` khỏi `src/server.ts` nếu không còn cần**
   - Server wrapper chỉ nên lo lỗi SSR catastrophic, không nên can thiệp route app bình thường.
   - Nếu vẫn cần redirect sớm cho `/`, chỉ giữ tối thiểu và không phá preview route.

4. **Kiểm tra lại preview**
   - Test `/index` trên live sandbox.
   - Test `/` và `/login`.
   - Kiểm tra console/network để chắc không còn màn hình trắng.

## File dự kiến chạm tới

- `src/routes/index.tsx`
- `src/routes/index_compat.tsx` hoặc route file tương đương cho `/index`
- `src/server.ts` nếu cần bỏ hack redirect