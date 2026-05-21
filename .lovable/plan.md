## Mục tiêu
Áp dụng hướng "Glass Prism" cho trang trống của trợ lý kế toán AI (`/chat`) — logo có halo gradient, tiêu đề lớn hơn, 4 suggestion card glass với icon bucket màu teal/blue, composer dạng pill bo tròn shadow lớn.

## Phạm vi
Chỉ chỉnh UI ở `src/routes/_app/chat.index.tsx`. Không đụng tới logic `start()`, `createThread`, `appendMessage`, navigate, hay component `Composer` (giữ nguyên để bảo toàn attach/mic/send/loading/autoFocus).

## Thay đổi cụ thể

1. **Logo hero**
   - Tăng lên 80×80, bo `rounded-2xl`, nền `var(--gradient-ai)`.
   - Halo: `absolute inset-0 blur-xl opacity-40` dùng cùng gradient, hover lên `opacity-60`.
   - Đổi icon `Sparkles` thành `Sparkle` (lucide) hoặc giữ Sparkles size lớn hơn.

2. **Tiêu đề & mô tả**
   - `text-4xl font-bold tracking-tight text-slate-900`, margin-bottom rộng hơn.
   - Subtitle `text-slate-500 leading-relaxed max-w-lg`.

3. **Grid 4 suggestion cards**
   - `bg-white/60 backdrop-blur-sm border border-slate-200 rounded-2xl p-5`.
   - Icon bucket `p-3 rounded-xl`, xen kẽ màu: card 1 & 4 teal (`bg-teal-50 text-teal-600`), card 2 & 3 blue (`bg-blue-50 text-blue-600`).
   - Hover: border đổi sang teal/blue tương ứng + `shadow-xl shadow-{color}-400/10`, bucket icon đảo nền thành solid + chữ trắng.
   - Title `font-semibold text-slate-900`, description `text-sm text-slate-500`.
   - Grid `grid-cols-1 md:grid-cols-2 gap-4`, không còn dùng `2xl:grid-cols-2`.

4. **Hint trước composer**
   - Đổi câu cuối thành uppercase: `text-xs font-medium text-slate-400 uppercase tracking-widest`.

5. **Composer wrapper**
   - Giữ component `<Composer>` nguyên vẹn (vì nó là phần có hành vi). Bọc trong khung `max-w-2xl` để giống tỉ lệ prototype.
   - Không tự dựng lại input/mic/send để tránh mất chức năng.

6. **Container**
   - Đổi outer thành `max-w-3xl` căn giữa dọc, padding rộng hơn cho cảm giác "prism".
   - Giữ pattern flex-col + composer fixed-ish ở đáy như hiện tại để không vỡ layout chat dock.

## File đụng tới
- `src/routes/_app/chat.index.tsx` (chỉ JSX/className, không đổi logic).

## Không làm
- Không sửa `Composer`, `ThreadList`, route khác.
- Không thêm dependency, không đổi design token toàn cục.
- Không đổi nội dung 4 gợi ý.
