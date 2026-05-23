## Mục tiêu
1. Đảm bảo mascot Fin hiển thị trên mobile (đang bị đẩy ra ngoài viewport).
2. Thu nhỏ các card gợi ý câu hỏi.
3. Đổi tiêu đề "Trợ lý kế toán AI" → "AI Agent Kế toán".

## Thay đổi trong `src/routes/_app/chat.index.tsx`

**Tiêu đề (H1)**
- "Trợ lý kế toán AI" → "AI Agent Kế toán"
- Giảm size mobile: `text-3xl md:text-4xl` (đang `text-4xl`)

**FinMascot — responsive size**
- Hiện tại `size="xl"` (200px) cố định → trên mobile chiếm quá nhiều chiều cao.
- Đổi sang dùng `size="lg"` mặc định (120px), thêm class wrapper `md:scale-[1.6]` hoặc đơn giản hơn: dùng `size="lg"` trên mobile, `size="xl"` trên md+ qua 2 component có ẩn/hiện `md:hidden` / `hidden md:inline-flex`.
- Giảm `mb-8` → `mb-4 md:mb-8`.

**Mô tả phụ**
- Gộp 2 đoạn p hiện tại thành 1 đoạn ngắn gọn trên mobile, đoạn dài giữ cho md+:
  - Mobile: chỉ giữ "Chào, mình là **Fin** — hỏi mình về sổ sách nhé."
  - Desktop (md+): thêm câu mô tả "Hỏi tự nhiên về dữ liệu kế toán…" như cũ với `hidden md:block`.
- Giảm `mb-10` → `mb-6 md:mb-10`.

**Suggestion cards — thu gọn**
- Padding: `p-5` → `p-3 md:p-5`
- Gap giữa icon và text: `gap-4` → `gap-3`
- Icon bucket: `h-11 w-11` → `h-9 w-9 md:h-11 md:w-11`, icon `h-5 w-5` → `h-4 w-4 md:h-5 md:w-5`
- Label: `font-semibold` giữ, thêm `text-sm md:text-base`
- Description text: `text-sm` → `text-xs md:text-sm`, có thể `line-clamp-1 md:line-clamp-none` để gọn 1 dòng trên mobile
- Grid gap: `gap-4` → `gap-2 md:gap-4`
- Grid margin: `mb-10` → `mb-6 md:mb-10`
- Đổi grid: vẫn `grid-cols-1 md:grid-cols-2`

**Container outer**
- `py-10` → `py-4 md:py-10` để bớt khoảng trắng dọc trên mobile.

**Dòng "Hoặc nhập câu hỏi bên dưới…"**
- Ẩn trên mobile để tiết kiệm chỗ: thêm `hidden md:block`.

## Không đụng
- Logic `start()`, server functions, Composer, ThreadList.
- File `fin-mascot.tsx`, `fin-mascot.png`, `styles.css`.

## Kết quả mong đợi
- Mobile 707×662: thấy đủ mascot Fin (size lg, ~120px), tiêu đề "AI Agent Kế toán", 1 dòng chào, 4 card gợi ý gọn (1 cột), và composer ở dưới — không cần scroll nhiều.
- Desktop: gần như giữ nguyên hiện tại, chỉ đổi chữ tiêu đề.
