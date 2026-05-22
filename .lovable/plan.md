## Mục tiêu

Khi user mở app tại `/`:
- Chưa đăng nhập → redirect tới `/login`
- Đã đăng nhập → redirect tới `/dashboard`

Landing page hiện tại được chuyển sang route công khai `/welcome` để vẫn có thể chia sẻ/giới thiệu sản phẩm khi cần.

## Thay đổi

1. **Tạo `src/routes/welcome.tsx`**
   - Copy nguyên nội dung component `Landing` từ `src/routes/index.tsx` hiện tại.
   - `createFileRoute("/welcome")` — không có `beforeLoad` (route công khai cho khách).
   - Cập nhật các `<Link to="/login">` giữ nguyên; thêm `head()` với title/description riêng cho SEO.

2. **Viết lại `src/routes/index.tsx`**
   - Bỏ component Landing.
   - Chỉ giữ `beforeLoad` thực hiện điều hướng:
     ```ts
     beforeLoad: async () => {
       const { data } = await supabase.auth.getSession();
       throw redirect({ to: data.session ? "/dashboard" : "/login" });
     }
     ```
   - `component` trả về `null` (sẽ không bao giờ render vì luôn redirect).

3. **Cập nhật liên kết tới Landing (nếu có)**
   - Rà soát các nơi trỏ về `/` mang ý nghĩa "trang giới thiệu" (ví dụ link "Điều khoản"/"Chính sách" trong `login.tsx` đang trỏ `/`) — giữ nguyên hoặc đổi sang `/welcome` tuỳ ý; mặc định không sửa để giảm phạm vi.

## Ghi chú kỹ thuật

- `routeTree.gen.ts` được Vite plugin tự sinh, không cần sửa tay.
- `beforeLoad` chạy trước render nên không có flash Landing.
- Không đụng tới logic auth/_app, không sửa backend.
