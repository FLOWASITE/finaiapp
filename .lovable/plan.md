## Phase 1 — Batch 2 (hoàn thiện tab Quy tắc hạch toán)

Sau batch 1 (banner v1→v2, approve flow, promote v2), còn 4 task để đóng Phase 1.

### 1. Lịch sử áp dụng + Hoàn tác (task #3)
- Thêm component `RuleApplicationsSheet` (Sheet/Drawer phải) hiển thị danh sách `RuleApplication`.
- Nguồn: server fn `listRuleApplications({ rule_id })` (đã có sẵn).
- Mỗi dòng: ngày áp dụng, chứng từ liên kết (document_label/journal_code), trạng thái (applied / undone), nút **Hoàn tác** (chỉ khi `status='applied'` và còn `journal_entry_id`).
- Hoàn tác gọi `undoRuleApplication({ id, reason })` — mở `AlertDialog` hỏi lý do trước.
- Wire nút "Xem N lần" trong `RuleCard` → `setHistoryOpen(true)`; toast + `invalidateQueries(['ai-memory'])` sau khi undo (trigger DB sẽ tự trừ applied_count).

### 2. Xoá quy tắc / Bỏ qua đề xuất (task #4)
- Thêm action **Xoá** trong footer `RuleCard` (chỉ cho quy tắc `user_taught` hoặc đã `disabled`, để tránh xoá nhầm rule đang chạy của AI).
- Mở `AlertDialog` xác nhận (cảnh báo nếu `applied_count > 0`: "đã chạy N lần, xoá sẽ không hoàn tác các bút toán").
- Gọi `deleteRule({ id })` (đã có server fn). Suggestion đã có nút "Bỏ qua" ở batch 1.

### 3. `templateToRuleV2` — generate conditions/actions từ template (task #5)
- Thêm hàm `templateToRuleV2(templateId, slots): { conditions: RuleCondition[]; actions: RuleAction[] }` trong `src/lib/ai-memory-templates.ts`.
- Mapping:
  - `vendor-account` → cond `vendor.name equals <vendor>`; action `book { account_debit, account_credit }`.
  - `desc-contains-account` → cond `description contains <keyword>`; action `book`.
  - `amount-threshold` → cond `amount <op> <threshold>`; action `notify` hoặc `flag` (tuỳ text).
  - `vendor-recurring` → 2 conds AND (`vendor.name`, `day_of_week`/custom field); action `book` + note `Định kỳ`.
  - `category-routing` → cond `category.predicted equals <cat>`; action `book` + `tag { department }`.
- Trong `RuleCard.onApprove`: gọi `parseSuggestion` → `templateToRuleV2` để pre-fill `conditions/actions` cho `RuleEditor` thay vì mở rỗng.
- Backfill khi user bấm **"Chuyển sang dạng cấu trúc"** trên rule v1 (banner): cũng dùng `parseSuggestion` + `templateToRuleV2` để pre-fill editor.

### 4. Empty state cho từng nhóm (task #7)
- Hiện tại `RulesListV2` chỉ hiện empty state khi cả 2 nhóm rỗng. Tách:
  - Có quy tắc đang chạy, không suggestion → ẩn block suggestion (đã đúng).
  - Có suggestion, không quy tắc → vẫn hiện danh sách suggestion + thông báo "Chưa có quy tắc đang chạy" thay vì empty state toàn trang.
  - Cả 2 rỗng → empty state (giữ nguyên).

### Files thay đổi
- `src/lib/ai-memory-templates.ts` — thêm `templateToRuleV2`.
- `src/components/ai-memory/rules-v2/RuleCard.tsx` — wire "Xem N lần", thêm nút Xoá, dùng `templateToRuleV2` trong approve.
- `src/components/ai-memory/rules-v2/RuleApplicationsSheet.tsx` — **MỚI**.
- `src/components/ai-memory/rules-v2/RulesListV2.tsx` — tách empty state, pre-fill khi approve.

### Không thay đổi
- Schema DB (đã đủ sẵn `ai_rule_applications`, `deleteRule`, `undoRuleApplication`).
- Migration mới.
