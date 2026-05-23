# Trạng thái hiện tại

Kiểm tra `src/components/fin-mascot.tsx` và các nơi dùng `mood="thinking"` (message-list khi đang stream, chat-skeleton khi loading):

- Khi `mood="thinking"` hiện **chỉ** có glow halo nhấp nháy nhanh hơn (`animate-pulse` ~2s thay vì 3s).
- **Chưa có** hiệu ứng bounce cho Fin.
- **Chưa có** vòng sáng (light ring) xoay quanh mascot.
- Float animation `fin-float` chỉ áp dụng cho size lg/xl/2xl và chạy mọi lúc, không liên quan trạng thái nghĩ.

→ Vậy: **chưa xong**. Hiện tại chỉ có pulse glow, thiếu bounce + ring xoay đúng như mô tả.

# Kế hoạch bổ sung

Chỉnh `src/components/fin-mascot.tsx`:

1. **Bounce nhẹ cho Fin khi `mood="thinking"`**
   - Thêm class `animate-bounce` (hoặc keyframe `fin-bounce` biên độ nhỏ ~4px, 1s ease-in-out infinite) lên `<img>` khi `mood === "thinking"`.
   - Ghi đè float để tránh xung đột animation.

2. **Vòng sáng xoay (light ring) khi `mood="thinking"`**
   - Thêm 1 `<div aria-hidden>` tuyệt đối phủ kín, `rounded-full`, border conic-gradient (teal → blue → trong suốt) tạo cảm giác vòng sáng chạy.
   - Animate bằng keyframe `fin-spin` (rotate 0 → 360deg, 2.5s linear infinite).
   - Chỉ render khi `mood === "thinking"`, đặt sau glow halo và trước `<img>` để nằm dưới mascot nhưng trên glow.

3. **Đăng ký keyframes** trong `src/styles.css` (nếu chưa có `fin-spin` / `fin-bounce`):
   ```css
   @keyframes fin-spin { to { transform: rotate(360deg); } }
   @keyframes fin-bounce-soft {
     0%,100% { transform: translateY(0); }
     50% { transform: translateY(-6px); }
   }
   ```

4. **Không thay đổi** API component (`size`, `mood`, `glow`, `className` giữ nguyên) → mọi nơi dùng `mood="thinking"` (message-list khi streaming, chat-skeleton) tự động có hiệu ứng mới.

# Kết quả mong đợi

- Khi AI đang trả lời / skeleton loading: mascot Fin bounce nhẹ, có vòng sáng xoay quanh + glow pulse → cảm giác "đang suy nghĩ" rõ ràng.
- Khi `mood="idle"` hoặc `"happy"`: giữ nguyên hành vi cũ.
