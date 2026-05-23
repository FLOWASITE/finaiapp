## Vấn đề chính

Backend đang hoạt động bình thường. Lỗi login hiện tại đến từ phía trình duyệt: sau build/preview, browser còn giữ session cũ hoặc refresh token hỏng trong localStorage. Supabase client tự cố refresh token này liên tục, làm cả request đăng nhập mới cũng bị `Failed to fetch`. Code hiện tại có dọn session khi lỗi, nhưng chỉ gọi `signOut({ scope: "local" })`; cách này vẫn có thể cần gọi auth API hoặc không xóa hết storage key bị hỏng, nên lỗi lặp lại.

## Kế hoạch sửa dứt điểm

1. **Tách helper dọn auth local thật sạch**
   - Tạo helper client-side để xóa toàn bộ key liên quan đến auth trong `localStorage`/`sessionStorage` theo project id và prefix Supabase.
   - Helper này không gọi network, nên vẫn chạy được ngay cả khi backend request đang fail.

2. **Sửa luồng `/login` để không bị refresh token cũ chặn**
   - Trước khi đăng nhập bằng email/password: nếu gặp lỗi network/timeout, dọn storage cứng rồi cho user thử lại.
   - Khi login thất bại do `Failed to fetch`, đổi thông báo rõ ràng hơn: “Đã dọn phiên cũ, bấm Đăng nhập lại”.
   - Thêm một lần retry an toàn sau khi dọn phiên cũ, để user không phải tự bấm lại nếu lỗi do session cũ.

3. **Chặn auto-redirect login phụ thuộc session hỏng**
   - Phần kiểm tra “đã đăng nhập thì chuyển dashboard” sẽ không để refresh token cũ gây nghẽn form.
   - Nếu phát hiện timeout/network khi `getSession`, dọn local session ngay.

4. **Ổn định guard route sau khi login**
   - Rà soát `_app` guard: dùng `getUser()` hoặc luồng kiểm tra phiên đáng tin cậy hơn trước khi vào dashboard, tránh vừa login xong lại bị đá về `/login` vì session chưa hydrate.

5. **Xác nhận bằng tín hiệu thực tế**
   - Kiểm tra lại code sau sửa và dùng logs/network hiện có để đảm bảo luồng không còn phụ thuộc refresh token cũ.

## Phạm vi không đổi

- Không đổi layout login.
- Không đổi logo FinAI.
- Không đổi màu sắc/giao diện hiện tại.
- Không động vào cấu hình backend hay database.