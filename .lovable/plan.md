## Thay đổi trang empty state /chat

### 1. Xoá tiêu đề
- Bỏ `<h1>AI Agent Kế toán</h1>` khỏi `src/routes/_app/chat.index.tsx`

### 2. Phóng to mascot Fin
- Thêm size `2xl` (~260px) vào `FinSize` trong `src/components/fin-mascot.tsx`
- Trên `chat.index.tsx`: đổi mobile từ `lg` → `xl`, desktop từ `xl` → `2xl`
- Điều chỉnh margin/spacing xung quanh mascot cho cân đối sau khi bỏ tiêu đề

### 3. Kết quả mong đợi
- Màn hình empty state chỉ còn mascot Fin to giữa màn + lời chào + suggestion cards
- Không còn chữ "AI Agent Kế toán"