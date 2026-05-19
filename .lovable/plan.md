# Fix mobile UI — Inbox button bị đẩy khỏi màn hình + chat trống

## Vấn đề hiện tại (390px)

Mở `/inbox` ở mobile, đã thấy:
1. **Header overflow ngang**: back arrow + logo + "Sổ AI" + AI-online pill + thanh search `flex-1` chiếm toàn bộ không gian, đẩy nút **Inbox (47)** và `MoreHorizontal` **ra ngoài viewport** → user không thể mở Inbox overlay.
2. **Stats strip + Tabs vẫn render trên mobile**: chiếm gần nửa màn hình, ép Chat xuống dưới (chỉ còn 1 input ở đáy, không thấy bubble nào).
3. **"Duyệt tất cả tin cậy cao"** button cũng nằm trong stats strip — không phù hợp khi user đang ở Chat mode trên mobile (đã có quick action trong chat seed rồi).

## Sửa

Áp dụng trên `<lg` (mobile/tablet hẹp):

### A. Header gọn lại
- **Ẩn** thanh search "Hỏi AI…" trên mobile (`hidden md:flex` hoặc `lg:flex`). User tap nút Inbox để duyệt batch, gõ thẳng vào ô chat ở dưới để hỏi.
- **Ẩn** chip ngày `periodLabel()` trên mobile.
- **Rút gọn** "AI online · vừa đọc N hoá đơn mới": trên mobile chỉ hiện chấm xanh + "AI online" (ẩn phần "vừa đọc…" bằng `hidden sm:inline`).
- Đảm bảo cụm phải (Inbox button + More) `ml-auto` để luôn dính mép phải.

### B. Ẩn Stats strip + Tabs trên mobile
- Stats strip (`<div className="flex shrink-0 items-center gap-8…">` line ~512): thêm `hidden lg:flex`.
- Tabs strip (line ~540): thêm `hidden lg:flex`. Mobile chỉ có Chat fullscreen, không cần tab switcher (Inbox AI là default; các tab khác user hiếm dùng trên phone).
- Nút "Duyệt tất cả tin cậy cao" → đã có quick-action trong chat seed bubble, đủ.

### C. Inbox overlay (đã có) — chỉ cần đảm bảo nó hoạt động sau khi nút Inbox hiện ra.

## Files
- `src/routes/_app/inbox.tsx` — thêm `hidden lg:flex` / `hidden md:flex` / `hidden sm:inline` ở các node nêu trên. Không sửa logic, chỉ ẩn/hiện theo breakpoint.

Không đụng `inbox-chat.tsx`, mockInbox, hay backend.
