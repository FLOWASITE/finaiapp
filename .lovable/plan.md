# Hoàn thiện Header trang Inbox AI

Chỉ sửa header trong `src/routes/_app/inbox.tsx` (route `chromeless`, không dùng AppHeader chung). Tận dụng component có sẵn — không tạo component mới trừ khi cần.

## 1. Hiển thị user / tenant
- Bên phải header (trước nút `…`), thêm cụm:
  - `<TenantSwitcher />` (đã có ở `src/components/tenant-switcher.tsx`) — gọn, có avatar chữ cái + tên công ty.
  - Một dấu `Separator` mảnh.
  - **User chip**: avatar tròn (avatar_url hoặc chữ cái từ `display_name`/`email`) lấy qua `useCurrentUser()`, click mở `DropdownMenu`:
    - Header item: hiển thị `display_name` + `email` (read-only).
    - "Cài đặt" → `/settings`.
    - "Trợ giúp & phím tắt" → mở CommandBar (gọi `setCmdOpen(true)`).
    - Separator.
    - "Đăng xuất" → `supabase.auth.signOut()` rồi `navigate({ to: "/login" })`.
- Trên màn hình `< md`: ẩn nhãn tenant + tên user, chỉ chừa avatar (giữ header gọn).

## 2. Nút `…` (MoreHorizontal) — gắn menu thật
Chuyển nút `…` từ button rỗng thành `DropdownMenu`:
- "Làm mới dữ liệu" → `qc.invalidateQueries({ queryKey: ["inbox-ai"] })` + toast.
- "Đổi kỳ kế toán" → mở dialog/route hiện có nếu sẵn, nếu không thì hiển thị toast "Đang phát triển" (đặt TODO comment).
- "Mở bảng phím tắt" → `setCmdOpen(true)`.
- Separator.
- "Về Dashboard" → `Link to="/dashboard"`.

(Việc "Đổi kỳ" hiện chỉ là chip read-only `periodLabel()`; giữ là menu item placeholder để khỏi mở rộng scope.)

## 3. Tinh chỉnh thị giác
- Bao header trong một thanh nổi: `mx-3 mt-3 rounded-2xl border border-border/40 bg-background/70 backdrop-blur-xl supports-[backdrop-filter]:bg-background/50 shadow-lg shadow-emerald-500/5` (đồng bộ phong cách `AppLayout` ở `_app.tsx`).
- Giảm `py-3.5` → `h-14` cố định; căn baseline các icon `h-9 w-9` thành `h-8 w-8` để nhẹ hơn.
- Nút quay lại + logo S gộp về một cụm có gap nhỏ hơn (`gap-2`).
- Badge "AI online": đổi nền sang `bg-emerald-500/15` + viền `border border-emerald-500/20` để pop hơn trên nền blur; hover hiển thị tooltip thời điểm cập nhật cuối (giữ `title` hiện có, có thể đổi sang `<Tooltip>` shadcn nếu nhẹ).
- Ô "Hỏi AI" (cmd-k): từ `lg:flex` → `md:flex` để hiện sớm hơn ở tablet; tăng `max-w-md` để không nuốt hết không gian; placeholder rút gọn ở `<lg`.
- Chip kỳ kế toán: đổi `lg:flex` → `md:flex`, dùng `text-foreground/70` thay vì `text-muted-foreground` để dễ đọc hơn.
- Tất cả icon button có `focus-visible:ring-2 ring-primary/40` cho a11y.
- Header tách khỏi stats strip bằng spacing (`mb-2` cho header) thay vì border cứng — vì giờ header đã nổi (card).

## Files
- `src/routes/_app/inbox.tsx` — sửa duy nhất.
- Imports mới: `TenantSwitcher`, `useCurrentUser`, `DropdownMenu*`, `Avatar*`, `Separator`, `LogOut`, `Settings`, `RefreshCw`, `Keyboard`, `Home` từ lucide.

## Out of scope
- Không đổi behavior của TenantSwitcher.
- Không thêm tooltip system mới nếu chưa cần.
- Không đụng vào stats strip hay tabs.
- Không sửa các route khác.
