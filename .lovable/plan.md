## Mục tiêu

Hoàn thiện sidebar Fin Chat (`ThreadList`) bằng cách thêm một **footer cố định** luôn dính ở đáy khi cuộn danh sách hội thoại — dùng được cả trên desktop và trong Sheet mobile.

## Thay đổi

### 1. `src/components/chat/thread-list.tsx` — refactor layout dạng flex 3 tầng

Cấu trúc mới của `<aside>`:

```
aside (flex-col, h-full)
├── Header   (shrink-0)  — mascot + tiêu đề + nút thu/mở + "Cuộc trò chuyện mới"
├── Search   (shrink-0)  — ô tìm + filter sao  (tách ra khỏi vùng scroll)
├── Scroll   (flex-1 min-h-0 overflow-auto)  — buckets + danh sách hội thoại
└── Footer   (shrink-0, border-t)  — MỚI: user menu + thoát Fin Chat
```

Điểm kỹ thuật:
- Vùng scroll dùng `flex-1 min-h-0 overflow-auto` để footer thực sự bị đẩy xuống đáy và không bị cuộn theo.
- Search bar + filter sao chuyển ra ngoài vùng scroll (cũng cố định trên cùng cho dễ thao tác).
- Footer có `border-t border-sidebar-border bg-sidebar` để tách biệt rõ khỏi list.

### 2. Footer mới — component `SidebarFooterUser` (inline trong cùng file)

Nội dung khi sidebar mở rộng:
- Bên trái: avatar tròn (chữ cái đầu của email) + email rút gọn (`truncate`) + label "Tài khoản".
- Bên phải: nút `MoreHorizontal` mở `DropdownMenu` chứa:
  - Hồ sơ
  - Cài đặt → điều hướng `/settings`
  - Chế độ sáng / tối (toggle theme, dùng `useTheme`)
  - **Thoát Fin Chat** → điều hướng `/` (về app chính)
  - Separator
  - Đăng xuất (destructive) → `supabase.auth.signOut()` rồi `window.location.href = "/login"`

Khi sidebar **collapsed** (desktop, `w-14`): footer chỉ hiển thị 1 avatar tròn 9×9 căn giữa, click mở cùng DropdownMenu trên.

Tận dụng: `useCurrentUser()` (đã có), `useTheme()` (đã có), `supabase` client, `DropdownMenu` shadcn — không thêm dependency.

### 3. Hành vi mobile

`ChatLayout` đã render `ThreadList` bên trong `SheetContent` với `onItemClick={() => setMobileOpen(false)}`. Footer sẽ tự nằm sát đáy Sheet vì `SheetContent` có `h-full`. Thêm `onItemClick?.()` vào nút "Thoát Fin Chat" để đóng Sheet trước khi điều hướng.

### 4. Không thay đổi

- Logic server function, query, mutation giữ nguyên.
- `chat-header`, `chat-layout-context`, `routes/_app/chat.tsx` không đổi.
- Không động vào business logic / DB.

## Kết quả mong đợi

- Khi cuộn danh sách hội thoại dài, footer (user + menu thoát) luôn hiển thị ở đáy sidebar — cả desktop lẫn Sheet mobile.
- Người dùng có lối thoát rõ ràng khỏi Fin Chat (vì app header đã bị ẩn ở route `/chat`) và truy cập nhanh đăng xuất / đổi theme.
