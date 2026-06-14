
## Mục tiêu
Card gợi ý ở màn `/chat` (cả mode Kế toán lẫn AI) đang quá to, chiếm gần nửa màn mobile và nội dung AI (email báo giá, dịch thuật, tóm tắt văn bản) lệch khỏi định vị kế toán của FinAI. Cần thu gọn + viết lại đúng ngữ cảnh KTV/KTT.

## Phạm vi
Chỉ chỉnh `src/routes/_app/chat.index.tsx` (UI + nội dung suggestions). Không đụng logic `start()`, composer, header, hay thread storage.

## Thay đổi

### 1. Thu gọn card (visual)
- Padding: `p-3 md:p-5` → `p-2.5 md:p-3`.
- Icon bucket: `h-9 w-9 md:h-11 md:w-11` → `h-8 w-8 md:h-9 md:w-9`, icon `h-4 w-4` cố định.
- Gap card: `gap-3` → `gap-2.5`; grid gap `md:gap-4` → `md:gap-2.5`.
- Border radius: `rounded-2xl` → `rounded-xl`; bucket `rounded-xl` → `rounded-lg`.
- Title: `text-sm md:text-base font-semibold` → `text-[13px] md:text-sm font-semibold`, `mb-0` (bỏ `mb-0.5 md:mb-1`).
- Subtitle: luôn `line-clamp-1`, `text-xs` cả mobile lẫn desktop; bỏ `md:text-sm md:line-clamp-none` để card luôn 2 dòng đồng đều.
- Bỏ `hover:shadow-xl` (chỉ giữ `hover:border-{tone}-400` + nền bucket đổi màu) để card cảm giác "tool kế toán" gọn hơn, không hào nhoáng.
- Giảm khoảng cách khối: `mb-6 md:mb-10` quanh grid → `mb-4 md:mb-6`; mascot `mb-4 md:mb-6` → `mb-3 md:mb-4`; FinMascot desktop `2xl` → `xl`.
- Ẩn dòng "Hoặc nhập câu hỏi bên dưới…" (đã có placeholder composer, thừa).

### 2. Viết lại nội dung suggestions

**Mode Kế toán** (giữ tinh thần hiện tại, gọn lại label):
- `Database` · "Chi phí tháng" — "Tổng chi phí tháng này là bao nhiêu?"
- `Users` · "Top NCC" — "Top 5 nhà cung cấp chi nhiều nhất năm nay"
- `FileCheck` · "Hoá đơn chờ duyệt" — "Còn bao nhiêu hoá đơn đầu vào chưa duyệt?"
- `Receipt` · "Công nợ phải trả" — "Số dư TK 331 theo nhà cung cấp"

**Mode AI** — viết lại hoàn toàn theo bối cảnh kế toán VN (vẫn là "trò chuyện tự do", không truy vấn DB, nhưng prompt phải hữu ích cho KTV):
- `BookOpen` · "Tra cứu chính sách" — "Giải thích ngắn gọn Nghị định 123/2020 về hoá đơn điện tử"
- `Receipt` · "Định khoản" — "Mua văn phòng phẩm 2.000.000đ trả tiền mặt thì hạch toán thế nào?"
- `Mail` · "Soạn công văn" — "Soạn email nhắc công nợ quá hạn cho khách hàng, giọng lịch sự"
- `FileCheck` · "Kiểm tra hoá đơn" — "Checklist kiểm tra tính hợp lệ của hoá đơn GTGT đầu vào"

Bỏ icon `Sparkles`, `Languages` (không liên quan kế toán). Import lại lucide cho gọn.

### 3. Kỹ thuật
- Không đổi shape `SUGGESTIONS`, không đổi `TONE_STYLES` (chỉ tinh chỉnh class trong JSX).
- Không thêm dependency, không động tới mode switch / composer / start().

## Kiểm chứng
Mở preview `/chat` ở mode AI và mode Kế toán (viewport 707×662 hiện tại + desktop): 4 card chiếm ≤ 50% chiều cao, đều 2 dòng, nội dung kế toán; mascot + tiêu đề + grid + composer cùng hiển thị không phải cuộn ở desktop.
