# Hoàn thiện Quy tắc hạch toán trong Trí nhớ AI

Hiện trạng (đã có): bảng `ai_memory_rules` (conditions/actions JSON, mode, threshold), `ai_rule_applications`, UI tab "Quy tắc hạch toán" với RuleCard / RuleEditor / Approve / Toggle / xem lịch sử. **Thiếu**: AI chưa tự sinh suggestion từ pattern thật, rule engine chưa được gọi khi Inbox AI đề xuất hạch toán, và UI editor chưa thuận tiện chọn TK 152/153/156/211/213/242.

## Phạm vi

### 1. Engine: áp dụng rule khi Inbox AI đề xuất hạch toán
Thêm `src/lib/rules/apply-rules.server.ts`:
- `loadActiveRules(supabase, tenantId)` — đọc rules `type='active' AND enabled AND mode IN ('auto','suggest')`.
- `evaluateConditions(rule, ctx)` — match `vendor.tax_id / vendor.name / amount / description / doc_type / category.predicted / line.account_predicted` với operator hiện có (`equals/contains/in/between/...`).
- `applyRules(ctx)` → trả về `{ matched: Rule[], autoActions: RuleAction[], suggestActions: RuleAction[] }`.

Tích hợp tại `materializePurchaseVoucherFromDocument` (sau khi đã có vendor + lines, trước khi insert):
- Với rule `mode='auto'` + match đủ confidence ⇒ override `debit_account` / `purpose_code` / tag và **insert một dòng vào `ai_rule_applications`** (status=`applied`, `document_table='purchase_vouchers'`, `then_snapshot`).
- Với rule `mode='suggest'` ⇒ ghi `ai_log.suggested_rules[]` (không override).

Cập nhật `applied_count`, `last_used_at`, `accuracy_total` (+1) qua RPC nhỏ `bump_rule_metrics(rule_id)`.

### 2. Tự động học & sinh đề xuất quy tắc
Thêm `src/lib/rules/learn-rules.server.ts` chạy cuối `materializePurchaseVoucher` (best-effort):
- Tổng hợp 90 ngày gần nhất theo nhóm `(vendor.tax_id, line.debit_account)` từ `purchase_vouchers` + `purchase_voucher_lines` đã `posted`.
- Khi một nhóm xuất hiện ≥ 3 lần và **chưa có rule active tương ứng** ⇒ insert suggestion:
  - `type='suggestion'`, `source='ai-learned'`, `mode='suggest'`
  - `conditions = [{ field:'vendor.tax_id', operator:'equals', value: mst }]`
  - `actions = [{ type:'book', params:{ account_debit: '156', note: 'Học từ N phiếu' } }]`
  - `title` & `when_text/then_text` sinh tiếng Việt rõ ràng để hiển thị ngay khi chưa promote.
- Dedupe bằng hash `(tenant, vendor_tax_id, debit_account)`.

### 3. UI/UX RuleEditor & RuleCard
- **RuleEditor**: cho action type `book`, thay input text `account_debit` bằng `<Select>` các nhóm tài khoản chuẩn theo project-knowledge:
  - 152 — Nguyên vật liệu
  - 153 — Công cụ dụng cụ
  - 156 — Hàng hóa
  - 211 — TSCĐ hữu hình
  - 213 — TSCĐ vô hình
  - 242 — Chi phí trả trước (phân bổ)
  - 627/641/642 — Chi phí dịch vụ (mặc định)
  - Tự do nhập số TK khác.
- Thêm gợi ý field thông dụng cho condition: `vendor.tax_id`, `vendor.name`, `description contains`, `amount between`.
- **RuleCard**: hiển thị accuracy dạng badge "X/Y · Z%" (đã có ở bản v1, port sang v2), nút "Xem N lần áp dụng" mở `RuleApplicationsSheet` (đã có).
- Empty state hiện 2 nút: "Tạo quy tắc thủ công" + "Học từ phiếu đã ghi sổ" (gọi 1 lần `learnRulesNow()`).

### 4. Đo lường & vòng lặp feedback
- Khi user **sửa** một field đã được rule auto-fill (chỗ phê duyệt trong Inbox AI), gọi `markRuleApplicationIncorrect(application_id)` ⇒ `accuracy_total +1` nhưng không tăng `accuracy_correct`. Khi user **giữ nguyên & duyệt**, `accuracy_correct +1`.
- Nếu accuracy < 60% sau ≥ 10 lần ⇒ tự động chuyển rule sang `mode='suggest'` và gắn `paused_reason`.

## Files (sửa/tạo)

Tạo mới:
- `src/lib/rules/apply-rules.server.ts`
- `src/lib/rules/learn-rules.server.ts`
- `src/lib/rules/account-presets.ts` (constants 152/153/156/211/213/242…)

Sửa:
- `src/lib/inbox-ai.functions.ts` — gọi `applyRules` trước insert, `learnRules` sau insert, mark accuracy khi approve có sửa field.
- `src/components/ai-memory/rules-v2/ActionsBlock.tsx` — Select tài khoản.
- `src/components/ai-memory/rules-v2/RuleCard.tsx` — badge accuracy + nút lịch sử.
- `src/components/ai-memory/rules-v2/RulesListV2.tsx` — nút "Học từ phiếu đã ghi sổ" ở empty state.
- `src/lib/ai-memory.functions.ts` — thêm `learnRulesNow`, `markApplicationOutcome`.

Migration:
- RPC `bump_rule_metrics(rule_id uuid, correct boolean)` — atomic update applied_count/accuracy.
- (Không thay schema bảng — đã đủ cột.)

## Ngoài phạm vi
- Không động đến tab khác (Đối tác, Bối cảnh, Hạn mức, Agent của Fin).
- Không sửa flow hóa đơn bán ra (sales) trong vòng này.
- Không đổi schema bảng `ai_memory_rules` / `ai_rule_applications`.
