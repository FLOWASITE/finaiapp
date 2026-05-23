## Vấn đề

Backend (Lovable Cloud) bình thường. Lỗi "Không kết nối được máy chủ" / "Failed to fetch" khi đăng nhập đến từ **phía client**:

- `localStorage` đang giữ một `refresh_token` hỏng (`"uhutxzheunqb"` — quá ngắn so với token thật).
- Supabase client tự động retry refresh token đó liên tục (`autoRefreshToken: true`), gây nghẽn pipeline fetch → submit login mất 30+ giây mới báo lỗi.
- `useEffect` ở `login.tsx` gọi `supabase.auth.getSession()` ngay khi mount, tiếp tục kích hoạt refresh hỏng → trì hoãn cả màn login.

## Mục tiêu

1. Login phản hồi tức thì (≤ 1–2s khi backend OK).
2. Tự dọn session hỏng thay vì retry vô hạn.
3. Không block UI khi `getSession()` chậm.

## Thay đổi (chỉ frontend, không đụng backend / schema)

### 1. `src/integrations/supabase/client.ts` — KHÔNG sửa (file auto-generated)

Thay vào đó, xử lý ở chỗ tiêu thụ.

### 2. `src/routes/login.tsx`

- **Race `getSession()` với timeout 1500ms** để không block render màn login. Nếu quá hạn → coi như chưa đăng nhập, hiển thị form ngay.
- **Nếu phát hiện refresh token lỗi** (event `TOKEN_REFRESHED` thất bại hoặc `getSession()` trả lỗi network kèm có session lưu cũ) → gọi `supabase.auth.signOut({ scope: 'local' })` để xoá localStorage hỏng, rồi cho user đăng nhập lại sạch.
- **Thêm AbortController + timeout 12s** quanh `signInWithPassword` để fail nhanh thay vì chờ 30s.
- **Disable nút khi đang loading** nhưng cho phép user huỷ (nút "Huỷ" hiện sau 5s loading).

### 3. `src/routes/__root.tsx` (`AuthSync`)

- Lắng nghe thêm event `TOKEN_REFRESHED` với `session == null` (refresh fail) → tự `signOut({ scope: 'local' })` và redirect `/login` nếu user đang ở route protected. Tránh loop retry âm thầm.
- Hiện tại `invalidateQueries()` chạy cho cả `SIGNED_IN` — giữ nguyên, nhưng đảm bảo không chạy khi đang ở `/login` (không cần thiết).

### 4. `src/routes/index.tsx` (`IndexRedirectFallback`)

- Đã có fallback 800ms, OK. Giảm xuống 600ms để chuyển trang nhanh hơn khi `getSession()` treo.

### 5. Tiện ích nhỏ: `src/lib/auth-recovery.ts` (mới)

Helper `withTimeout<T>(promise, ms)` dùng chung cho `getSession()` và `signInWithPassword()`.

## Kết quả mong đợi

- Trang `/login` hiển thị tức thì kể cả khi có session hỏng trong localStorage.
- Lần submit đầu tiên (sau khi tự dọn session hỏng) chạy thẳng vào Supabase Auth API, không bị nghẽn → ~500ms–1s.
- Nếu mạng thật sự lỗi, báo lỗi sau 12s thay vì 30+s.
- Không còn vòng lặp refresh token hỏng chạy ngầm.

## Ngoài phạm vi

- Không đổi schema, không đụng RLS, không thay đổi luồng OAuth.
- Không thêm dependency mới.
