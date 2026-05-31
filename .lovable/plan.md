## Mục tiêu
Làm header chat (thanh trên cùng chứa nút ☰, tiêu đề, toggle Kế toán/AI, ⋯) bán trong suốt + frosted-blur giống vùng composer ở đáy, để thấy thấp thoáng nội dung tin nhắn phía sau khi cuộn.

## Thay đổi
`src/components/chat/chat-header.tsx` — dòng 32:
- Đổi `bg-background/80` → `bg-background/45`
- Giữ `backdrop-blur-xl` (đã có) để chữ vẫn đọc được.
- Đổi `border-border/60` → `border-border/40` cho viền dưới mờ hơn, hài hoà với nền trong suốt.

```tsx
<header className="sticky top-0 z-20 border-b border-border/40 bg-background/45 backdrop-blur-xl">
```

## Kết quả
Header chat trong suốt ~55%, nội dung tin nhắn lướt qua phía sau header sẽ hiện mờ nhẹ — đồng bộ với phần composer ở đáy đã làm.
