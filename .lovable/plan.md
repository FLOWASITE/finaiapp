# Vuốt đóng & Esc cho InboxItemSheet trên mobile

## Hiện trạng
- `InboxItemSheet` dùng `<Sheet side="right">` (Radix Dialog).
- **Esc đã hoạt động sẵn** qua Radix — không cần code thêm. Sẽ chỉ verify lại sau khi sửa.
- Chưa có thao tác vuốt đóng — trên mobile sheet chiếm 100% chiều rộng nên phải bấm nút X mới đóng được.

## Thay đổi (chỉ trong `src/components/inbox/inbox-item-sheet.tsx`)

### 1. Thêm gesture vuốt đóng
- Bắt `onTouchStart / onTouchMove / onTouchEnd` trên `SheetContent`.
- Trên mobile (`window.innerWidth < 640`, tức dưới Tailwind `sm`):
  - Track delta X từ điểm chạm đầu tiên. Chỉ kích hoạt khi vuốt **sang phải** (dx > 0) và bắt đầu trong vùng nội dung không scroll ngang.
  - Trong khi vuốt: set `transform: translateX(dx)px` + giảm `opacity` overlay tương ứng (style inline trên SheetContent ref).
  - Khi `touchend`:
    - Nếu `dx > width * 0.30` **hoặc** vận tốc > 0.5 px/ms → gọi `onClose()`.
    - Ngược lại → animate transform về 0 (transition 200ms) rồi clear inline style.
  - Hủy gesture nếu phát hiện scroll dọc trội hơn (|dy| > |dx| trong 10px đầu) để không phá scroll danh sách chat history.

### 2. Affordance UI
- Thêm thanh "drag handle" mảnh (`h-1 w-10 rounded-full bg-border/60`) ở mép trái sheet trên mobile (`sm:hidden`) để user thấy có thể vuốt.

### 3. Esc
- Không cần thêm handler — Radix Dialog đã đóng khi nhấn Esc và gọi `onOpenChange(false)` → `onClose()`. Ghi chú trong code 1 dòng comment để tránh người sau "fix nhầm".

## Out of scope
- Không đổi side sheet trên mobile (giữ right cho nhất quán).
- Không thêm thư viện gesture (framer-motion drag) — touch handler thuần đủ nhẹ.
- Không sửa các Sheet khác trong app.
