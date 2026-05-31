## Vấn đề
Vừa rồi tôi tăng nền header lên `bg-background/75` để chữ dễ đọc — nhưng giờ header trông gần như đặc, mất cảm giác trong suốt mà bạn muốn.

## Hướng xử lý
Giảm độ đặc xuống mức trong suốt rõ rệt, bù lại bằng blur + saturate mạnh và một lớp gradient mờ dần ở mép dưới để chữ vẫn nổi.

## Thay đổi
`src/components/chat/chat-header.tsx` — dòng 32:

- `bg-background/75` → `bg-background/35` (trong suốt rõ, thấy nội dung chat phía sau).
- Giữ `backdrop-blur-2xl backdrop-saturate-150` (frosted-glass mạnh để chữ không bị lẫn nền).
- Bỏ `border-b border-border/40`, thay bằng gradient fade dưới đáy header để chuyển mượt sang nội dung chat (giống cách composer fade ở đáy):

```tsx
<header className="sticky top-0 z-20 bg-background/35 backdrop-blur-2xl backdrop-saturate-150">
  {/* nội dung header giữ nguyên */}
  <div className="pointer-events-none absolute inset-x-0 -bottom-6 h-6 bg-gradient-to-b from-background/35 to-transparent" />
</header>
```

## Kết quả
Header trong suốt rõ (thấy chat lướt qua bên dưới), nhưng nhờ blur mạnh + saturate + fade gradient, chữ "Fin"/tiêu đề + icon vẫn đọc tốt trên mọi nền sáng/tối.
