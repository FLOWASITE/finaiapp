## Mục tiêu

Đưa mascot **Fin** vào 2 nơi đầu tiên (giai đoạn 1):
1. **Avatar AI trong khung chat** (thay icon `Sparkles` cạnh tin nhắn assistant + skeleton "đang nghĩ").
2. **Empty state của trang chat** (`/chat`) — thay khối logo `Sparkles` lớn bằng Fin chào hỏi.

Giữ nguyên backend, server fn, logic chat. Chỉ đụng vào presentation.

## Files sẽ tạo / sửa

**Tạo mới**
- `src/assets/fin-mascot.png` — ảnh Fin (cần user upload, xem mục Asset bên dưới).
- `src/components/fin-mascot.tsx` — component chung:
  ```tsx
  <FinMascot size="xs|sm|md|lg|xl" mood="idle|thinking|happy" className?/>
  ```
  - `xs` (28px) dùng cho avatar tin nhắn
  - `xl` (128px) dùng cho empty state
  - `mood="thinking"` thêm class `animate-pulse` nhẹ + dot indicator
  - Render `<img>` với `loading="eager"`, `draggable={false}`, alt "Fin — trợ lý AI"
  - Bọc trong khối bo tròn + glow `var(--gradient-ai)` để khớp design hiện tại

**Sửa**
- `src/components/chat/message-list.tsx` (dòng ~175–188): thay block `Sparkles` trong avatar assistant bằng `<FinMascot size="xs" mood={streaming && isLast ? "thinking" : "idle"} />`. Giữ wrapper glow + ring để không vỡ layout.
- `src/components/chat/chat-skeleton.tsx`: trong `SkeletonRow` bên trái (assistant), thay vòng tròn xám bằng `<FinMascot size="xs" mood="thinking" />` để khi đang chờ phản hồi, Fin xuất hiện thay vì placeholder vô danh.
- `src/routes/_app/chat.index.tsx` (dòng ~91–106): thay khối brand 80×80 (`Sparkles` + gradient blur) bằng `<FinMascot size="xl" mood="happy" />`. Cập nhật tiêu đề phụ:
  - H1 giữ "Trợ lý kế toán AI"
  - Thêm dòng phụ nhỏ bên dưới: *"Chào, mình là **Fin** — hỏi mình về sổ sách nhé."* (text-sm, text-slate-600, mb-2 trên đoạn mô tả hiện có).

**Không đụng**: `chat-dock.tsx` (avatar nhỏ ở dock — để giai đoạn 2 sau khi user duyệt), `inbox-item-sheet.tsx`, các trang khác.

## Asset

Cần user gửi file ảnh Fin (PNG, nền trắng hoặc trong suốt). Khi build mode bật:
- Nếu user đã đính kèm: copy vào `src/assets/fin-mascot.png`.
- Nếu chưa: dùng `imagegen` tạo phiên bản tạm theo mô tả mascot robot xanh teal cute trên nền trắng, để demo ngay; user thay file sau.

## Cách dùng token màu

- Vòng glow quanh Fin tái dùng `var(--gradient-ai)` đã có trong `styles.css` → đồng bộ với màu chat hiện tại, không thêm color cứng.
- Skeleton "thinking": thêm 3 chấm `bg-muted-foreground/40` `animate-bounce` cạnh Fin để gợi cảm giác đang gõ.

## Kết quả mong đợi

- Mọi tin nhắn AI trong chat hiển thị mặt Fin thay vì icon ✨.
- Khi đang stream / đang tải, Fin xuất hiện ở khung skeleton với hiệu ứng nhẹ.
- Vào `/chat` khi chưa có hội thoại, Fin xuất hiện to ở giữa, chào người dùng — tăng nhận diện thương hiệu ngay từ điểm chạm đầu tiên.

Giai đoạn 2 (sau khi user OK): dock collapsed footer, splash, empty states cho các trang chính.