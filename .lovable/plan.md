## Mục tiêu
Header chat hiện đang `bg-background/45` — trên nền sáng (bảng hóa đơn trắng) chữ tiêu đề + icon bị chìm, khó đọc. Cần tăng độ đặc + blur mạnh hơn để chữ luôn rõ trên mọi nền (sáng/tối/ảnh).

## Thay đổi
`src/components/chat/chat-header.tsx` — dòng 32:

- `bg-background/45` → `bg-background/75` (đặc hơn nhưng vẫn thấy thấp thoáng nội dung phía sau).
- `backdrop-blur-xl` → `backdrop-blur-2xl` + thêm `backdrop-saturate-150` để frosted-glass rõ và tách khỏi nền.
- Giữ `border-border/40`.

```tsx
<header className="sticky top-0 z-20 border-b border-border/40 bg-background/75 backdrop-blur-2xl backdrop-saturate-150">
```

## Kết quả
Chữ "Fin"/tiêu đề + nút Kế toán/AI luôn dễ đọc trên cả nền sáng lẫn tối, vẫn giữ cảm giác trong suốt nhẹ.
