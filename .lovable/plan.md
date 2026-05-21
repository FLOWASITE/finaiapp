## Mục tiêu

Tinh gọn header `/inbox` (`src/routes/_app/inbox.tsx` → component `InboxHeader`): nhận diện thương hiệu rõ ràng, lộ rõ workspace mode (AI ↔ Kế toán), và bỏ phần "AI online" gây nhiễu.

## Thay đổi chính

### 1. Brand block (trái)
- Đổi chữ `Sổ AI` → `FinAI` (font-semibold, tracking-tight).
- Ô vuông avatar `S` (emerald) → logo `F` (giữ kiểu hiện tại để không phá layout) hoặc icon `Sparkles` trong khối gradient. Đề xuất: chữ `F` trắng trên nền `bg-primary` cho đồng bộ với toàn app.
- Cập nhật `head meta.title` từ `"Sổ AI · FinAI"` → `"Inbox · FinAI"` (đỡ trùng lặp).

### 2. Bỏ "AI online · đang theo dõi"
- Xoá toàn bộ pill emerald có dot ping + text `AI online`/`vừa đọc N hoá đơn` (lines ~643-658).
- Bỏ luôn prop `recentlyReadDelta` và effect tracking `prevPendingRef` nếu không còn dùng ở chỗ khác (kiểm tra: chỉ dùng trong header → an toàn xoá).

### 3. Thêm Mode switcher (AI ↔ Kế toán)
- Dùng hook sẵn có `useWorkspace()` (`src/hooks/use-workspace.ts`) — đã có `workspace: "front" | "back"` và setter persist localStorage.
- UI: một segmented control nhỏ, 2 nút bằng nhau, đặt ngay sau brand:
  ```
  [ ✨ AI ] [ 📊 Kế toán ]
  ```
  - Active: `bg-foreground text-background`
  - Inactive: `text-muted-foreground hover:text-foreground`
  - Icon: `Sparkles` cho AI, `Calculator` (lucide) cho Kế toán
  - Click "Kế toán" → `setWorkspace("back")` rồi `navigate({ to: "/dashboard" })` (vì Inbox là trải nghiệm Front/AI; chuyển sang Back nên rời route).
- Tooltip giải thích ngắn: "Chuyển sang chế độ kế toán đầy đủ".

### 4. Các đề xuất tinh chỉnh hợp lý kèm theo
- **Period chip**: giữ nhưng đổi thành button mở `PeriodSwitcher` (hiện đang là `<div>` tĩnh) — sẵn có component `src/components/period-switcher.tsx`.
- **Ask AI search**: rút gọn placeholder khi viewport hẹp; thêm shortcut hint `⌘K` luôn hiển thị từ `md` trở lên (hiện đang `sm:inline`, ổn — giữ).
- **Separator dọc**: thêm separator giữa Mode switcher và Ask AI để phân nhóm thị giác.
- **Avatar dropdown**: thêm mục "Chuyển workspace" trong dropdown để có lối tắt thứ hai (nhất quán với `WorkspaceSwitcher` ở sidebar).
- **Accessibility**: thêm `aria-label` cho 2 nút mode; `title` tooltip "Đang ở chế độ AI".

## File chạm

- `src/routes/_app/inbox.tsx` — chỉ sửa `InboxHeader` (~ lines 607-730) + xoá `recentlyReadDelta` plumbing (~ lines 142, 171-180, 385).

## Không đổi

- Toàn bộ tabs, stats strip, list logic.
- Sidebar, các route khác.
- Không tạo file mới, không đổi schema/DB.

## Câu hỏi xác nhận (nếu cần)

Bạn muốn nút "Kế toán" trong Mode switcher:
- (a) Chỉ đổi workspace rồi ở lại `/inbox`?
- (b) Đổi workspace và điều hướng sang `/dashboard` (Back workspace landing)?

Mặc định plan dùng (b) vì Inbox AI là trải nghiệm Front; nếu bạn muốn (a) cứ nói khi approve.