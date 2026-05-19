## Mục tiêu

Khi bấm **Tạo quy tắc** trên thẻ đề xuất (suggestion), thay vì giữ nguyên text thô do AI gợi ý, hệ thống sẽ:

1. Nhận diện *mẫu* (template) phù hợp với nội dung đề xuất.
2. Tự sinh lại WHEN/THEN theo **cú pháp chuẩn** — rõ ràng, đọc được, có thể đối chiếu khi audit.
3. Cho user xem preview chuẩn-hoá trong dialog, có thể tinh chỉnh slot trước khi xác nhận.
4. Lưu vào `ai_memory_rules` với `type='active'`, `source='user-taught'`, kèm `origin` ghi rõ mẫu nào được dùng.

## Các mẫu (template) hỗ trợ

Mỗi mẫu = `{ id, label, whenTemplate, thenTemplate, slots[] }`. Sinh text bằng cách điền slot.

| id | Khi nào áp | WHEN chuẩn | THEN chuẩn |
|---|---|---|---|
| `vendor-account` | Đề xuất nhắc 1 NCC + 1 TK chi phí | `vendor = "{vendor}"` | `Nợ {debit_acc} / Có {credit_acc}` |
| `desc-contains-account` | Đề xuất dựa trên từ khoá mô tả | `description contains "{keyword}"` | `Nợ {debit_acc} / Có {credit_acc}` |
| `amount-threshold` | Đề xuất giới hạn số tiền | `amount {op} {threshold}` (op ∈ `>`, `>=`, `<`, `<=`) | `{action}` (vd: "Yêu cầu duyệt cấp 2") |
| `vendor-recurring` | Đề xuất giao dịch định kỳ | `vendor = "{vendor}" AND day_of_month = {day}` | `Tạo bút toán định kỳ Nợ {debit_acc} / Có {credit_acc} = {amount}` |
| `category-routing` | Đề xuất gán nhóm chi phí | `category = "{category}"` | `Hạch toán vào TK {debit_acc}, phòng ban "{department}"` |

Mẫu `vendor-account` là mặc định khi không nhận được mẫu nào khớp.

## Thay đổi server (`src/lib/ai-memory.functions.ts`)

1. Thêm helper `src/lib/ai-memory-templates.ts` (client-safe, dùng được cả ở UI để preview):
   - Export `RULE_TEMPLATES` (mảng template).
   - Export `parseSuggestion(rule)` — đọc `when_text/then_text/title` thô, trả về `{ templateId, slots }` đoán tốt nhất qua regex (vd. `/vendor[:=]\s*"?([^"]+)"?/i`, `/(\d{3,4})\b/` để tìm số TK 642/111/331…, `/contains?\s*"([^"]+)"/i`).
   - Export `renderRule(templateId, slots)` → `{ when_text, then_text, title }` đã chuẩn hoá tiếng Việt.

2. Sửa `promoteSuggestion`:
   - Bỏ chữ ký cũ `{ id }` thuần. Thêm optional `template_id`, `slots`, `when_text`, `then_text`, `title` (đều optional — UI sẽ gửi bản đã preview).
   - Nếu UI gửi WHEN/THEN đã render → dùng trực tiếp.
   - Nếu chỉ gửi `id` (fallback) → load suggestion, gọi `parseSuggestion` + `renderRule` server-side rồi update.
   - `origin` ghi: `"Tạo từ đề xuất ngày dd/mm/yyyy — mẫu: {label}"`.

3. Mở rộng `promoteWatchToRule` tương tự (cũng chuẩn hoá trước khi insert).

Không cần migration — vẫn dùng các cột hiện có.

## Thay đổi UI (`src/routes/_app/ai.memory.tsx`)

Trong `RuleCard`, viết lại dialog **"Xem trước quy tắc"** (`createOpen`):

1. Khi mở dialog → chạy `parseSuggestion(rule)` ở client → state `{ templateId, slots }`.
2. Hiển thị:
   - **Select mẫu**: dropdown 5 mẫu, mặc định mẫu detect được. Đổi mẫu → reset slot mặc định từ rule gốc.
   - **Slot inputs**: render động theo `RULE_TEMPLATES[templateId].slots` (Label + Input/Select TK). Số TK có gợi ý quick-pick (111, 112, 131, 331, 511, 627, 642…).
   - **Preview KHI/THÌ chuẩn hoá** (sử dụng `ChipWhen`/`ChipThen` hiện có) — re-render khi slot đổi.
   - Dòng phụ: "Đề xuất gốc: ..." (text thô, italic muted) để user đối chiếu.
3. Nút **Xác nhận tạo** gọi `promoteSuggestion.mutate({ data: { id, template_id, slots, when_text, then_text, title } })`.

Không đổi layout, màu sắc, các phần khác của trang.

## Kiểm thử

- Suggestion mẫu "Highlands → 642" → preview phải hiện `vendor = "Highlands"` / `Nợ 642 / Có 111`.
- Đổi sang mẫu `desc-contains-account` → slot keyword auto fill từ title → preview cập nhật.
- Sửa số TK 642 → 6428 → preview cập nhật ngay; xác nhận → rule lưu đúng text chuẩn, type=`active`, source=`user-taught`, origin có tên mẫu.
- Suggestion text rỗng/lạ → parseSuggestion vẫn trả default `vendor-account` với slot trống — nút "Xác nhận" disabled cho tới khi slot bắt buộc được điền.
