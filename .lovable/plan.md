## Tóm tắt
Thêm nhóm tin nhắn theo ngày trong khung chat chính với các nhãn: "Hôm nay", "Hôm qua", "Thứ X", "Ngày DD/MM/YYYY".

## Chi tiết

### 1. Cập nhật kiểu dữ liệu tin nhắn
- File: `src/components/chat/message-list.tsx`
- Thêm `created_at?: string` vào `ChatMsg` type

### 2. Truyền timestamp từ DB xuống component
- File: `src/routes/_app/chat.$threadId.tsx`
- Trong hàm map từ `query.data.messages` sang `ChatMsg`, giữ lại `created_at` từ DB
- Khi tạo tin nhắn local (user gửi và assistant đang stream), thêm `created_at: new Date().toISOString()` để có thể nhóm

### 3. Nhóm và hiển thị theo ngày trong MessageList
- File: `src/components/chat/message-list.tsx`
- Thêm hàm `groupByDate(messages)` trả về các nhóm với nhãn ngày
- Logic nhãn:
  - Cùng ngày với "hôm nay" → "Hôm nay"
  - Ngày hôm qua → "Hôm qua"
  - Cùng tuần (trong 7 ngày qua, không phải hôm nay/hôm qua) → "Thứ X"
  - Cũ hơn → "Ngày DD/MM/YYYY"
- UI: Render divider ngày giữa các nhóm — pill/sticky label căn giữa, font nhỏ, màu muted-foreground, không chiếm nhiều không gian dọc

### Files thay đổi
- `src/components/chat/message-list.tsx`
- `src/routes/_app/chat.$threadId.tsx`