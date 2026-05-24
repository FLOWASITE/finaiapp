
# Migrate Rule v1 → v2

Hợp nhất Rule v1 (text-based) và Rule v2 (IF/AND/OR/THEN có cấu trúc) thành **một schema duy nhất** trong bảng `ai_memory_rules`. Sau migration, cả tab **Quy tắc** lẫn **Memory Graph** đều dùng cùng nguồn dữ liệu, edge trên graph dựng từ `conditions`/`actions` thật chứ không còn dò regex.

## Nguyên tắc

- **Không phá BC**: giữ nguyên `when_text` / `then_text` làm chuỗi hiển thị + fulltext search. Trigger sẽ tự sinh lại từ `conditions`/`actions` khi ghi v2; ngược lại khi parse v1 cũ sẽ điền vào `conditions`/`actions`.
- **Một bảng, hai layer đọc**:
  - Layer "v2 structured" (mới): `conditions jsonb`, `actions jsonb`, `mode`, `confidence_threshold`, `status`, `applies_to`, `enabled`, `version`.
  - Layer "v1 text" (giữ): `when_text`, `then_text`, `title`, `type`, `source`, `applied_count`, `accuracy_*`.
- **Backfill bắt buộc**: chạy 1 lần cho mọi row hiện có; nếu parse thất bại → để `conditions = []`, `actions = []` (rule vẫn hoạt động ở chế độ "raw text only", không bị mất).
- **Không thay đổi RLS** — vẫn `is_tenant_member`.

## Schema migration

Thêm cột v2 vào `ai_memory_rules`:
- `conditions jsonb NOT NULL DEFAULT '[]'::jsonb` — array `RuleCondition[]`.
- `actions jsonb NOT NULL DEFAULT '[]'::jsonb` — array `RuleAction[]`.
- `mode text NOT NULL DEFAULT 'suggest'` — CHECK in (`auto`, `suggest`, `learn_only`, `disabled`).
- `confidence_threshold numeric(4,3) NOT NULL DEFAULT 0.8` — 0..1.
- `applies_to text NOT NULL DEFAULT 'future'` — CHECK in (`future`, `retroactive`).
- `enabled boolean NOT NULL DEFAULT true`.
- `status text NOT NULL DEFAULT 'active'` — CHECK in (`active`, `paused`, `disabled`, `draft`).
- `paused_reason text`.
- `version integer NOT NULL DEFAULT 1`.
- `previous_version_id uuid REFERENCES public.ai_memory_rules(id) ON DELETE SET NULL`.
- `schema_version smallint NOT NULL DEFAULT 1` — đánh dấu row đã được backfill v2 chưa (1 = legacy, 2 = structured).

Index hỗ trợ graph + filter:
- `CREATE INDEX ai_memory_rules_conditions_gin ON ai_memory_rules USING gin (conditions jsonb_path_ops)`.
- `CREATE INDEX ai_memory_rules_actions_gin ON ai_memory_rules USING gin (actions jsonb_path_ops)`.
- `CREATE INDEX ai_memory_rules_status_idx ON ai_memory_rules(tenant_id, status, mode)`.

`type` (v1: suggestion/active/disabled) giữ nguyên để code cũ tiếp tục đọc. Sau khi rời hoàn toàn v1, sẽ derive từ (`mode`, `status`) — không cần migration thêm.

Sync 2 chiều bằng trigger nhẹ (PL/pgSQL):
- **BEFORE INSERT/UPDATE**: nếu `conditions`/`actions` non-empty và `when_text`/`then_text` rỗng → sinh chuỗi tóm tắt human-readable bằng hàm `fn_rule_render_text(conditions, actions)` (port logic `renderRuleText` ở `ai-memory-templates.ts`). Ngược lại, `type` được tự suy từ (`mode`, `status`): `disabled→disabled`, `mode=suggest&status=active→suggestion`, `mode=auto&status=active→active`.

## Backfill

Chạy ngay trong migration (idempotent, chỉ chạm row có `schema_version = 1`):

```sql
UPDATE public.ai_memory_rules r
SET conditions = public.fn_parse_when_text(r.when_text),
    actions    = public.fn_parse_then_text(r.then_text),
    mode       = CASE r.type WHEN 'active' THEN 'auto' WHEN 'suggestion' THEN 'suggest' ELSE 'disabled' END,
    status     = CASE r.type WHEN 'disabled' THEN 'disabled' ELSE 'active' END,
    enabled    = (r.type <> 'disabled'),
    schema_version = 2
WHERE r.schema_version = 1;
```

`fn_parse_when_text(text) → jsonb` và `fn_parse_then_text(text) → jsonb` là 2 SQL function dùng regex parse các pattern đã có trong `ai-memory-templates.ts` (`vendor = "..."`, `description contains "..."`, `amount > N`, `Nợ XXX / Có YYY`, …). Pattern không khớp → trả `'[]'::jsonb`. Rule như vậy vẫn render được bằng `when_text` cũ.

## Server fn

Sửa `src/lib/ai-memory.functions.ts`:
- `listRules`: thêm `conditions`, `actions`, `mode`, `confidence_threshold`, `status`, `applies_to`, `enabled`, `version` vào projection.
- `createRule` / `updateRule`: nhận thêm `conditions?: RuleCondition[]`, `actions?: RuleAction[]`, `mode?`, `confidence_threshold?`, `status?`, `applies_to?`, `enabled?`. Validate bằng Zod (re-use các literal từ `src/types/rule.ts`). Khi nhận v2, set `schema_version = 2`; trigger DB lo sinh `when_text`/`then_text`.
- `approveSuggestion`: khi promote suggestion → active, đồng thời cho phép kèm `conditions`/`actions` đã chỉnh ở `RuleEditor`.

Sửa `src/lib/graph/memory-graph.functions.ts`: projection thêm `conditions`, `actions`, `mode`, `status`, `confidence_threshold`, `enabled` để adapter dùng trực tiếp.

## Adapter & Graph

`src/lib/graph/adapt-db.ts`:
- `rowToRule` đọc thẳng `conditions` / `actions` từ DB nếu `schema_version = 2`; nếu 1 thì giữ fallback regex hiện tại.
- Vẫn giữ `extraEdges` (partner, classification) — bổ sung, không thay thế.

`build-graph.ts`: không đổi public API, chỉ cần input có conditions/actions thật.

## UI

`src/routes/_app/ai.memory.tsx`:
- `EditRuleDialog` (đang dùng `editWhen` / `editThen` text 2 ô) chuyển sang **render `RuleEditor` v2** (đã có sẵn ở `src/components/ai-memory/rules-v2/RuleEditor.tsx`). Khi rule là legacy (`schema_version = 1` và `conditions = []`), hiện banner "Quy tắc dạng văn bản cũ" + nút "Chuyển sang dạng cấu trúc" — bấm → parse client-side (re-use logic), điền sẵn RuleEditor để user xác nhận.
- List view: nếu `conditions.length > 0` → render bằng `RuleCard` (v2) có chip điều kiện/hành động; nếu rỗng → fallback text như hiện tại.
- Suggestion approval (rendered preview): cho phép mở thẳng RuleEditor trước khi approve để user tinh chỉnh thành v2.
- `MemoryGraph` `GraphSidebar.tsx`: ưu tiên render v2 (conditions/actions chips); fallback v1 text giữ nguyên.

`src/lib/ai-memory-templates.ts`: bổ sung `templateToRuleV2(template) → { conditions, actions, when_text, then_text }` để các template (vendor→TK, keyword→TK, recurring, …) sinh thẳng cấu trúc v2.

## Files

Tạo mới:
- `supabase/migrations/<ts>_rule_v2_migrate.sql` — schema + backfill + trigger + 2 SQL parse function.
- `src/lib/rules/rule-text.ts` — helper render `conditions/actions` → human text (dùng chung client; mirror logic SQL function).

Sửa:
- `src/lib/ai-memory.functions.ts` — projection, Zod, create/update/approve nhận v2.
- `src/lib/ai-memory-templates.ts` — thêm `templateToRuleV2`.
- `src/lib/graph/adapt-db.ts` — dùng `conditions/actions` thật khi có.
- `src/lib/graph/memory-graph.functions.ts` — projection v2.
- `src/components/ai-memory/graph/GraphSidebar.tsx` — branch v2 trước, v1 sau.
- `src/routes/_app/ai.memory.tsx` — `EditRuleDialog` dùng `RuleEditor`; list dùng `RuleCard` khi có cấu trúc; approval flow.
- `src/components/ai-memory/rules-v2/RuleEditor.tsx` — nhận `onSave(payload)` để chia sẻ với DB create/update (hiện đang local-state).
- `src/integrations/supabase/types.ts` — tự regen sau migration (không sửa tay).

Giữ nguyên:
- RLS, realtime channel, `sampleRules.ts` (chỉ dùng cho Storybook/demo).

## Phạm vi & rủi ro

- Mọi rule cũ tiếp tục chạy: khi parse thất bại, frontend vẫn render text → user có thể chuyển thủ công.
- Trigger sync 2 chiều có thể ghi đè `when_text`/`then_text` cũ khi user lưu v2 — đây là behavior mong muốn, sẽ hiển thị diff "đã đồng bộ" lần lưu đầu.
- Sau khi >90% rule có `schema_version = 2`, plan riêng để xoá hoàn toàn cột `type`/`source` text legacy và rename `conditions`/`actions` thành nguồn duy nhất.
