# Hiển thị tabs trên mobile (Inbox)

## Vấn đề
Trên mobile, dải tabs ("Inbox AI", "Đã hạch toán", "Cần xem lại", "Tài liệu", "Báo cáo") đang bị ẩn vì có class `hidden lg:flex` (line 572 của `src/routes/_app/inbox.tsx`). Mobile chỉ thấy khu chat fullscreen, không có cách chuyển tab.

## Thay đổi (chỉ UI, không đụng logic)

File: `src/routes/_app/inbox.tsx`

1. **Bỏ ẩn dải tabs trên mobile** (line 572):
   - Đổi `hidden ... lg:flex` → luôn `flex`.
   - Thêm `overflow-x-auto` + `whitespace-nowrap` + ẩn scrollbar để tabs cuộn ngang gọn trên màn hình hẹp.
   - Giảm padding ngang trên mobile (`px-3 lg:px-5`), giảm chiều cao tab (`py-2.5 lg:py-3`) để không chiếm quá nhiều không gian.

2. **Mobile body nghe theo `tab`** (line 679):
   - Khi `tab === "inbox"` → giữ nguyên `<InboxChat …>` fullscreen như hiện tại.
   - Khi `tab` thuộc `posted | review | documents | reports` → render `<EmptyTab label={…} />` (component đã có sẵn cho desktop) để mobile cũng thấy được nội dung tương ứng (placeholder "đang xây dựng" giống desktop), thay vì luôn cố định chat.

3. Không đổi:
   - Logic state `tab`, badge số `stats.pending`, mock data, server functions.
   - Overlay Inbox trượt từ trái (nút "Inbox (47)"), loading/empty state vừa thêm ở turn trước.
   - Desktop layout giữ y nguyên.

## Kiểm thử
- Mở `/inbox` ở 360px / 390px / 414px: thấy 5 tab có thể cuộn ngang, bấm chuyển tab thấy nội dung đổi.
- Tab "Inbox AI" vẫn hiện chat + badge số `pending`.
- Tab khác hiển thị `EmptyTab` placeholder.
- Desktop ≥ lg: không thay đổi gì.
