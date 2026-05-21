# Hiển thị tiến trình xử lý chứng từ inline trong khung chat

## Vấn đề
Hiện tại khi attach file, tiến trình parse → phân loại → sẵn sàng đang hiển thị qua `ParseProgressDialog` — một **modal popup phủ toàn màn hình**, che mất khung chat và danh sách thread (như ảnh chụp).

Bạn muốn UI này hiện **inline trong khung chat**, để cảm giác như một bước tự nhiên của cuộc trò chuyện, không phải popup chặn ngữ cảnh.

## Giải pháp

### 1. Tách `ParseProgressDialog` thành 2 lớp
- **`ParseProgressPanel`** (mới): toàn bộ phần nội dung hiện tại (stepper 3 phase, chips tóm tắt, danh sách bucket, nút Huỷ / Tiếp tục) — render thuần, không có `Dialog` wrapper.
- **`ParseProgressDialog`**: giữ lại như shim cũ (cho tương thích) nhưng chỉ wrap `ParseProgressPanel` trong `Dialog`. Không file nào khác cần đổi nếu vẫn muốn modal.

### 2. Đổi cách `Composer` render panel
Trong `src/components/chat/composer.tsx`:
- Bỏ `<ParseProgressDialog open=...>` (modal) ở cuối JSX.
- Thay bằng `<ParseProgressPanel ... />` **render ngay phía trên thanh nhập liệu** (inline trong khung composer), chỉ hiện khi `parsePhase !== null`.
- Panel có:
  - Nền card mềm `bg-card/80 backdrop-blur` + viền + bo góc.
  - `max-h` hạn chế chiều cao (vd 60vh), nội dung scroll trong panel.
  - Nút "×" thu nhỏ ở góc để đóng/huỷ — thay cho thao tác đóng modal.
- Khi phase = `ready` và auto-continue đã chạy → panel tự ẩn (logic cũ giữ nguyên).

### 3. Vị trí render
Vì `Composer` được dùng ở 2 nơi (`chat-dock` và `chat.$threadId.tsx`), đặt panel **bên trong** `Composer` nghĩa là cả 2 chỗ đều có inline tự động — không cần sửa caller.

```text
┌─ Khung chat ───────────────┐
│ Tin nhắn 1                  │
│ Tin nhắn 2                  │
│ ...                         │
├────────────────────────────┤
│ ┌ ParseProgressPanel ───┐  │  ← inline, không che
│ │ Trích xuất ✓ → Phân  │  │
│ │ loại ⟳ → Sẵn sàng    │  │
│ │ [Huỷ]  [Tiếp tục]    │  │
│ └──────────────────────┘  │
│ [+] [Nhập tin nhắn...] [▶]│  ← composer
└────────────────────────────┘
```

## Files thay đổi
- `src/components/chat/parse-progress-dialog.tsx` — tách `ParseProgressPanel` ra, `ParseProgressDialog` thành wrapper mỏng.
- `src/components/chat/composer.tsx` — thay modal bằng inline panel phía trên input.

## Không thay đổi
- Toàn bộ logic parse/classify/decisions giữ nguyên.
- Không động đến `message-list`, `chat-dock`, server functions, hay luồng streaming.
