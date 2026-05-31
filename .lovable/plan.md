## Mục tiêu
Vùng khoanh đỏ ở đáy (ô "Nhắn cho trợ lý AI…" + dòng disclaimer) hiện đang là một dải đặc che mất nội dung chat phía sau. Cần làm vùng này bán trong suốt + làm mờ nền (frosted glass) để thấy được message phía dưới khi cuộn.

## Nguyên nhân
Hai lớp tạo dải đặc:
1. `.chat-footer-fade` trong `src/styles.css` — gradient phủ 55% chiều cao bằng `var(--background)` đặc → che hết phần dưới.
2. Bản thân `<Composer>` dùng `bg-card/70 backdrop-blur-xl` — vẫn còn 70% mờ.
3. Wrapper `div.relative px-4 pb-5 pt-4` trong `chat.$threadId.tsx` và `chat.index.tsx` không có nền nhưng kết hợp với fade ở trên gây cảm giác đặc.

## Thay đổi

### 1. `src/styles.css` — `.chat-footer-fade`
Đổi gradient: bỏ phần đặc 55%, thay bằng gradient nhẹ + thêm `backdrop-filter: blur` để vùng dưới mờ ảnh nhưng vẫn nhìn xuyên thấy.

```css
.chat-footer-fade {
  background: linear-gradient(
    to top,
    color-mix(in oklab, var(--background) 55%, transparent) 0%,
    color-mix(in oklab, var(--background) 20%, transparent) 60%,
    transparent 100%
  );
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}
```

### 2. `src/components/chat/composer.tsx`
Dòng 543: đổi `bg-card/70` → `bg-card/45` để khung composer trong hơn (vẫn giữ `backdrop-blur-xl` để chữ đọc được).

### 3. `src/routes/_app/chat.$threadId.tsx` và `src/routes/_app/chat.index.tsx`
- Mở rộng dải fade: đổi `-top-8 h-8` → `-top-16 h-16` để chuyển tiếp mượt hơn.
- Đảm bảo wrapper `px-4 pb-5 pt-4` không có background đặc (đã ok).

## Kết quả mong đợi
```
[ Tin nhắn cũ hiện mờ nhẹ phía sau ]
[ ô "Nhắn cho trợ lý AI…" (bán trong suốt + blur) ]
[ disclaimer ]
```
Người dùng có thể thấy thấp thoáng nội dung chat phía sau ô nhập thay vì một dải đặc.
