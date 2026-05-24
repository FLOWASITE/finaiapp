## Cross-Agent Feedback Loop: Reconcile → Categorize

Khi Agent Đối soát phát hiện bút toán lệch với bank statement, hệ thống tự động "phạt" rule/template/memory đã tạo ra bút toán sai — giảm `hit_count`, hạ `confidence_score`, và nếu sai nhiều lần thì auto-demote sang `suggest` hoặc `disabled`.

### 1. Schema mới

**`agent_feedback_events`** — bảng event log (audit + replay):
- `tenant_id`, `source_agent` ('reconcile'|'review'|'manual'), `target_agent` ('categorize')
- `event_type`: `wrong_account` | `wrong_amount` | `wrong_partner` | `wrong_vat` | `duplicate` | `missed_entry`
- `journal_entry_id`, `bank_transaction_id`, `proposal_id` (nullable — link về proposal gốc nếu còn)
- `signals_snapshot` jsonb (rule_id, template_id, memory_id, partner_history_id đã match)
- `severity` numeric (0.1 → 1.0)
- `processed_at`, `note`

**`ai_rule_penalties`** — tổng hợp điểm phạt cộng dồn (để engine tra cứu nhanh):
- `tenant_id`, `target_kind` ('rule'|'template'|'memory'|'partner_history')
- `target_id`, `penalty_score` numeric default 0
- `wrong_count` int, `last_penalty_at`
- Unique `(tenant_id, target_kind, target_id)`

### 2. Reconcile Agent emit event

Trong `src/lib/reconcile/` (file đối soát hiện có) khi phát hiện lệch:

```
emitFeedback({
  source: 'reconcile',
  event_type: 'wrong_account',
  journal_entry_id,
  bank_transaction_id,
  severity: 0.5,  // tuỳ mức lệch
})
```

Tạo `src/lib/feedback/emit.server.ts`:
- Tra `ai_journal_proposals` theo `journal_entry_id` → lấy `signals` (rule_id/template_id/memory_id/partner_history_id)
- Insert `agent_feedback_events` + snapshot signals
- Gọi `applyPenalty()` ngay (synchronous, nhanh)

### 3. Penalty Engine (`src/lib/feedback/penalty.server.ts`)

**Công thức `applyPenalty(event)`:**

| Event type | Severity base | Áp dụng lên |
|---|---|---|
| `wrong_account` | 0.5 | rule + template (cùng lúc) |
| `wrong_partner` | 0.4 | memory + partner_history |
| `wrong_vat` | 0.3 | template |
| `wrong_amount` | 0.6 | rule (thường là sai mapping) |
| `duplicate` | 0.7 | rule (rule quá lỏng) |

**Tác động lên bảng nguồn:**
- `ai_memory_rules`: `accuracy_correct -= 1`, `applied_count` giữ nguyên (vì đã apply rồi nhưng sai)
- `ai_journal_templates`: `success_count -= 1`, tăng `error_count` (thêm column nếu chưa có)
- `ai_memory_partners` / `ai_memory_*`: `hit_count = GREATEST(0, hit_count - 1)`, `confidence_score -= 0.05`

**Cộng dồn `ai_rule_penalties.penalty_score += severity * weight_event`** (decay 30 ngày — mỗi đêm trừ 10%).

### 4. Auto-demote

Khi `penalty_score` vượt ngưỡng:
- `>= 1.5` và `wrong_count >= 3`: demote `mode='active' → 'suggest'`
- `>= 3.0` và `wrong_count >= 5`: demote `mode='suggest' → 'disabled'` + ghi `disabled_reason='auto: cross-agent feedback'`
- Memory `confidence_score < 0.4`: chuyển `status='archived'`

Chạy trong cùng `applyPenalty()` (synchronous, đảm bảo ngay lập tức).

### 5. Engine integration

Trong `src/lib/categorize/calibration.server.ts` — khi đọc signal weights, cộng thêm penalty lookup:

```
effective_confidence = base * weight_signal * (1 - penalty_factor)
// penalty_factor = min(0.5, penalty_score / 6)
```

→ Rule/template từng sai nhiều sẽ tự động bị "giảm tiếng nói" trong confidence ngay cả khi chưa bị disable.

### 6. UI

**Trang `/settings/ai-feedback`** (mới):
- Tab "Sự kiện gần đây" — list `agent_feedback_events` 30 ngày (filter by source/type)
- Tab "Rule/Template bị phạt" — sort `ai_rule_penalties.penalty_score DESC`, hiện wrong_count, last_penalty_at, link sang rule editor
- Tab "Đã auto-demote" — list rule/memory bị demote do feedback (filter `disabled_reason LIKE 'auto:%'`)
- Nút "Khôi phục" (reset penalty + đưa lại `active`) — owner/admin only

**`ProposalCard.tsx`**: nếu signals match rule có `penalty_score > 1.0` → hiện chip vàng "Rule này từng sai 3 lần".

### 7. Hook reconcile hiện tại

Đọc lại `src/lib/reconcile/` (nếu chưa có thì sẽ tạo điểm emit ở các chỗ:
- Sau khi `bank_transactions.status = 'mismatch'`
- Khi user revert bút toán đã posted từ reconcile UI
- Khi auto-match score thấp < 0.3 nhưng entry đã được auto-post trước đó

### Files dự kiến

**Migration:**
- `agent_feedback_events`, `ai_rule_penalties` + RLS + indexes
- Thêm `error_count`, `disabled_reason` vào `ai_journal_templates` nếu thiếu

**Server (mới):**
- `src/lib/feedback/emit.server.ts` — emit + apply
- `src/lib/feedback/penalty.server.ts` — formula + auto-demote
- `src/lib/feedback/decay.server.ts` — daily decay job
- `src/lib/feedback/feedback.functions.ts` — server fn cho UI (list events, list penalties, restore)
- `src/routes/api/public/hooks/feedback-decay.ts` — cron 03:00 UTC

**Server (chỉnh):**
- `src/lib/reconcile/*.server.ts` — gọi `emitFeedback` ở các điểm phát hiện lệch
- `src/lib/categorize/calibration.server.ts` — lookup penalty khi tính effective confidence
- `src/lib/categorize/engine.server.ts` — pass penalty lookup vào pipeline

**UI:**
- `src/routes/settings/ai-feedback.tsx` (3 tab)
- `src/components/categorize/ProposalCard.tsx` — chip cảnh báo rule bị phạt

### KPI kỳ vọng

- Rule sai lặp lại giảm ~70% sau 2 tuần (auto-demote)
- Tỉ lệ post-edit (edit sau khi đã post) giảm ~40%
- Engine không "học" mãi rule cũ sai — feedback loop khép kín giữa Reconcile ↔ Categorize

Anh duyệt thì tôi triển khai theo thứ tự: migration → emit/penalty engine → reconcile hooks → cron decay → UI.
