# Fix tin nhắn dài không xuống dòng

## Vấn đề
Tin nhắn user trong `src/components/chat/message-list.tsx` (line 56) dùng `whitespace-pre-wrap` nhưng thiếu `break-words` → chuỗi liên tục dài (URL, từ không khoảng trắng) tràn ra ngoài bubble. `min-w-0` đã có nhưng chưa đủ.

## Thay đổi

### `src/components/chat/message-list.tsx`
Thêm `break-words` vào class bubble user:
```
"max-w-[78%] whitespace-pre-wrap break-words rounded-2xl bg-primary ..."
```

### `src/components/chat/markdown.tsx`
Thêm `break-words` vào `<p>` (và các block khác có text dài như `<a>`, `<code>`) để tin nhắn AI có chuỗi dài cũng wrap được.

## Phạm vi
2 file, chỉ thêm utility class Tailwind, không đổi logic.
