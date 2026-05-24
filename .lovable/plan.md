## Mục tiêu

Refactor `src/components/inbox/inbox-item-sheet.tsx` để khớp với prototype đã chọn (v1 — AI assistant tinh tế), giải quyết các vấn đề trong screenshot: tiêu đề/đối tác trống hiện toàn dấu "—", số tiền trôi nổi, khối bút toán đơn điệu, footer rời rạc.

## Thay đổi UI (chỉ frontend, giữ nguyên props & logic)

**Header (gọn lại)**
- Icon Sparkles trong vòng tròn nền `emerald-50` + tiêu đề cố định "Đề xuất của Sổ AI"
- Thanh tiến trình tin cậy (progress bar 12px) + label "Tin cậy N%", màu theo band: ≥80 emerald, ≥50 amber, <50 rose
- Bỏ tiêu đề hoá đơn ra khỏi header (chuyển xuống Summary), tránh lặp

**Summary block**
- Cột trái: label "Đối tác" → tên đối tác. Nếu trống → hiện "Chưa xác định tên" italic, muted (thay vì "—")
- Subline: `item.title` (truncate)
- Cột phải: số tiền lớn (text-2xl bold, tabular-nums) + thời gian relative

**Trust strip** (gom OCR + followup thành 1 dải nền muted/60)
- Chip trắng "✓ OCR đã đọc đầy đủ"
- Nút amber: lightbulb + `followups[0]` + chevron → mở chat hỏi AI

**Bút toán đề xuất** (rounded-2xl, border-border/60, bg-muted/30)
- Grid `[28px_44px_1fr_auto]`: nhãn Nợ/Có (blue/rose) → badge số TK trên nền nhạt → memo truncate → số tiền mono tabular-nums
- Divider mảnh giữa các dòng Nợ và dòng Có đầu tiên

**Signals & Blocker**: giữ nguyên (chip pill + cảnh báo rose nếu có)

**Footer thống nhất**
- Hàng nút: Duyệt & ghi sổ (flex-3, gradient primary, rounded-2xl, shadow primary/20) + Sửa (icon, rounded-2xl) + Bỏ qua (X, rounded-2xl)
- Pill phụ "Áp dụng quy tắc cho tương lai" — nền `primary/5`, viền `primary/20`, có icon Wand2

**Chat history**: giữ nguyên logic, làm tròn 2xl, message bubble rounded-2xl

## Token & màu

- Chrome (background, border, foreground, muted, primary, primary-foreground) dùng semantic tokens trong `src/styles.css`
- Màu trạng thái (emerald/amber/rose/blue cho Nợ-Có, tin cậy, OCR) dùng Tailwind utility — đây là pattern đã có khắp file hiện tại (dark mode variants kèm theo)
- CTA chính dùng `from-primary to-primary/85` thay vì hard-code blue-700

## Phạm vi

- 1 file: `src/components/inbox/inbox-item-sheet.tsx` (rewrite)
- Props `InboxItemSheetProps` giữ nguyên — mọi caller không cần đổi
- Không động vào server functions, types, hay logic chat/approve

## Acceptance

- Khi `item.partner` rỗng → hiện "Chưa xác định tên" (italic, muted), không còn dấu "—" trơ trọi
- Tin cậy 50% → progress bar half, màu amber
- Bút toán 3 dòng (642 / 133 / 331) căn cột đẹp với divider trước dòng Có
- Footer: 1 CTA gradient lớn + 2 nút phụ + pill rule, tất cả rounded-2xl
- Swipe-to-close (mobile) và Esc vẫn hoạt động
