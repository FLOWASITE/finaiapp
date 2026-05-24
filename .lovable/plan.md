## Goal

Nâng cấp card "Quy tắc hạch toán" trong **Trí nhớ AI** từ KHI/THÌ đơn giản sang **IF/AND/OR/THEN** đầy đủ (multi-condition, multi-action, ngưỡng tin cậy, chế độ auto/suggest, test 30 ngày, audit trail).

Phase này build **frontend prototype** trên sample data (theo đúng spec mục 11: "API stub returns sampleRules"). Không động vào bảng `ai_memory_rules` hiện tại — chạy song song với UI cũ, có thể swap về backend thật sau.

## Phạm vi Phase 1 (theo priority list của spec)

1. RuleCard read mode + sample data
2. RuleEditor drawer + Conditions builder
3. Actions builder
4. Settings (confidence slider + mode radio)
5. Test against history (mock simulator)
6. Conflict detection cơ bản

Phase 2 (Memory Graph, Smart Filters) — không làm lần này.

## Files

**Mới**
- `src/types/rule.ts` — types đúng spec mục 1
- `src/data/sampleRules.ts` — 5 rule mẫu (mục 2)
- `src/lib/rules/rule-fields.ts` — metadata field/operator (label VN, nhóm, operator hợp lệ theo kiểu)
- `src/lib/rules/rule-test.ts` — mock simulator chạy rule trên fake 30-day transactions, trả `{matched, would_book_correctly, would_change, conflicts}`
- `src/lib/rules/rule-store.ts` — Zustand store (list, upsert, toggle, remove); seed từ sampleRules
- `src/components/ai-memory/rules-v2/RuleCard.tsx` — card read-mode (header badge, conditions block, actions block, compact settings, footer stats + actions)
- `src/components/ai-memory/rules-v2/ConditionsBlock.tsx` — read + edit (`mode: "read" | "edit"`)
- `src/components/ai-memory/rules-v2/ActionsBlock.tsx` — read + edit, render theo `action.type` (book / tag / notify / flag / skip / set_field)
- `src/components/ai-memory/rules-v2/RuleSettings.tsx` — slider + 3 preset + 3 mode radio + applies_to + "ước tính N giao dịch"
- `src/components/ai-memory/rules-v2/RuleEditor.tsx` — Drawer phải 540px (full-screen mobile), 4 section collapsible, footer "Chạy thử / Lưu", validate Zod + RHF
- `src/components/ai-memory/rules-v2/RuleTestPanel.tsx` — chạy `rule-test`, hiển thị kết quả + nút "Xem chi tiết" (modal trước/sau)
- `src/components/ai-memory/rules-v2/RulesListV2.tsx` — list + empty state + nút "Tạo quy tắc thủ công"
- `src/components/ai-memory/rules-v2/ChipLabel.tsx` — chip KHI/THÌ/VÀ/HOẶC với màu đúng spec

**Sửa**
- `src/routes/_app/ai.memory.tsx`
  - Tab "Quy tắc hạch toán": thay nội dung (`RuleList` cũ) bằng `<RulesListV2 />`. Giữ logic count tabs khác y nguyên (đổi count rules sang `useRuleStore`).
  - Không xoá `RuleCard`/`RuleList` cũ ngay — comment hoặc rename `RuleCardLegacy` để rollback dễ; sẽ dọn ở Phase 2.

## Data model & visual

Đúng `Rule`, `RuleCondition`, `RuleAction` ở spec mục 1. Sample data theo mục 2 (5 rule: ai_learned auto, user_taught complex, guard >50tr, suggest-only đang test, paused vì accuracy thấp).

Chip màu (mục 4–5, 8):
- KHI `#26215C` · THÌ `#0F6E56` · VÀ `#4F46C7` · HOẶC `#BA7517`
- Source badge: AI TỰ HỌC `#4F46C7` (Bot), BẠN DẠY `#0F6E56` (User), TỪ MẪU `#737373` (LayoutTemplate), HỆ THỐNG `#1F1F1F` (Lock)
- Status pill: active+auto teal, active+suggest indigo, paused amber, disabled muted

Typography & spacing — theo mục 8 (title 14/500, field 12/mono, KHI/THÌ 10/600 uppercase, card padding 16, drawer 20, drawer width 540).

Toàn bộ dùng `src/styles.css` tokens — wrap màu hex spec vào CSS vars mới (`--rule-when`, `--rule-then`, `--rule-and`, `--rule-or`) để khỏi hardcode trong className.

## Conditions builder (mục 4)

Mỗi row edit: `[Logic ▼] [Field ▼ (grouped)] [Operator ▼ (filtered by field type)] [Value (input đổi theo operator)] [drag][×]`.

- Field groups: Đối tác / Số tiền / Thời gian / Tài khoản / Đặc thù VN (passenger, trip, line_count) / AI predicted
- Operator: filter theo `fieldType` trong `rule-fields.ts` (text → equals/contains/regex; number → >/=/between; enum → in/equals; date → equals/between)
- Value input: text / number / multi-select (cho `in`) / range (cho `between`) / regex với helper "Test pattern"
- Row đầu: ẩn logic dropdown, hiện chip "KHI"
- Drag handle dùng `@dnd-kit/sortable` (đã có trong project? check khi build; nếu không thì up/down arrows)
- Inline validate regex; save disabled nếu invalid

## Actions builder (mục 5)

Render khác nhau theo `action.type`:
- `book`: 2 account combobox (TK Nợ / TK Có) + ghi chú (hỗ trợ `{var}` interpolation hint)
- `tag`: department / project / custom_tags multi-input
- `notify`: channel (zalo/email/in_app) + target + when sub-condition + message_template
- `flag` / `skip`: chỉ note
- `set_field`: field picker + value

## Settings + test (mục 6–7)

- Slider 0.5–1.0, 3 preset card (95/85/70)
- Estimate count: hook gọi `rule-test` mock với threshold hiện tại
- Mode radio 3 option có icon (Zap / Lightbulb / Eye)
- Footer Drawer: nút **"Chạy thử 30 ngày qua"** — bắt buộc chạy 1 lần trước khi enable nút Lưu (state `hasTested`). Result hiển thị inline + nút "Xem chi tiết" mở Dialog 2 cột trước/sau.

## Edge cases (mục 10)

- Empty state với CTA
- Threshold 100% match 0 → warning "Cân nhắc hạ xuống 85%"
- Edit rule có applied_count > 100 → AlertDialog cảnh báo
- Regex invalid → red inline + disable Save
- Conflict detection: sau Lưu so sánh rule mới với store; nếu cùng condition set → banner "Conflict với X, chọn ưu tiên" (Phase 1: chỉ banner + cho drag reorder trong store).

## Interactions (mục 9)

- Click card body → mở Editor
- "Xem N lần áp dụng" → mở SourceAppliedSheet (tái dùng component có sẵn, truyền rule.id; nếu không khớp data thì hiện mock list)
- "Tắt" → AlertDialog + textarea reason
- Lưu → toast + scroll-to-card với class highlight `animate-pulse-once` (define trong styles.css)

## Tech

- React Hook Form + Zod (đã có)
- shadcn Drawer (right, có dùng `Sheet` vì vaul Drawer bottom-only — dùng `Sheet side="right"` cho desktop, `Drawer` cho mobile bằng `useIsMobile`)
- lucide-react icons (Bot, User, LayoutTemplate, Lock, Zap, Lightbulb, Eye, PlayCircle, Target, Clock)
- Zustand cho rule list (lib chưa cài → `bun add zustand` ở bước đầu build)
- Mock data only — không migration DB Phase này

## Không làm

- Bỏ qua server function / Supabase wiring (Phase 2)
- Bỏ qua Memory Graph & Smart Filters tab
- Không xoá tab/logic cũ, chỉ swap render trong tab "Quy tắc hạch toán"
