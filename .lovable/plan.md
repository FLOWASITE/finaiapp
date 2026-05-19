## Mục tiêu

Trang **Trí nhớ AI** hiện đã có tab **Quy tắc** và **Đang học** chạy thật. Ba tab còn lại (`Đối tác`, `Bối cảnh DN`, `Giới hạn`) đang là `ComingSoon`. Plan này hiện thực cả 3 theo đúng tinh thần bạn mô tả: mỗi dòng là **một câu tiếng Việt đọc được**, kế toán không cần code vẫn sửa được, và có liên kết ngược tới các bút toán đã chịu ảnh hưởng.

---

## 1. Mô hình dữ liệu (3 bảng mới)

Mỗi bảng đa-tenant + RLS theo `tenant_id`, dùng chung `tg_set_updated_at`.

**`ai_memory_partners`** — bộ nhớ hành vi đối tác

```text
id, tenant_id, party_id (FK customers/suppliers, nullable cho NV/cá nhân),
party_kind ('customer'|'supplier'|'employee'|'individual'),
display_name, behavior_text (1 câu mô tả), tags text[],
default_account, default_dept_id, default_project_id,
memo_keywords text[], bank_hints text[],   -- để khớp sao kê
confidence numeric, sample_count int,
last_seen_at, created_by, created_at, updated_at
```

**`ai_memory_context`** — system prompt về doanh nghiệp

```text
id, tenant_id, category (enum: 'org','accounting','tax','revenue','banking',
  'departments','business_model','einvoice','other'),
key (slug), label (vi), value_text (câu tiếng Việt),
value_json (jsonb, tuỳ chọn cho dữ liệu cấu trúc),
order_index, created_by, created_at, updated_at
unique(tenant_id, category, key)
```

Seed sẵn 12 entry mặc định khi tenant mới (loại hình, chuẩn mực VAS, năm tài chính, GTGT theo quý, v.v.) qua hàm `seed_ai_context_defaults(tenant)`.

**`ai_memory_limits`** — ranh giới an toàn

```text
id, tenant_id, code (slug duy nhất),
title (vi), rule_text (câu tiếng Việt),
limit_kind ('block'|'warn'|'require_review'),
scope (enum: 'amount','vendor','account','category','variance','cash','custom'),
params jsonb,  -- ví dụ { account: '156' } hoặc { amount_gt: 50000000 }
severity ('low'|'med'|'high'),
is_active bool, triggered_count int default 0,
last_triggered_at, created_by, created_at, updated_at
```

Seed 8 giới hạn mặc định (giống mô tả của bạn — bao gồm TT 219 ngưỡng 20tr tiền mặt).

**`ai_memory_applications_link`** *(mở rộng bảng `ai_rule_applications` hiện có)*: thêm cột `source_kind` ('rule'|'partner'|'context'|'limit') + `source_id uuid` (nullable). Cho phép mọi loại memory đều có "lần áp dụng".

Trigger `tg_ai_rule_applications_stats` cập nhật thêm `triggered_count`/`sample_count` tương ứng.

---

## 2. Server functions

Tạo 3 file mới (`src/lib/ai-memory-partners.functions.ts`, `…-context.functions.ts`, `…-limits.functions.ts`). Mỗi file đi theo cùng pattern như `ai-memory.functions.ts` (middleware `withTenant`, Zod validator):

- `list*`, `create*`, `update*`, `delete*`
- `toggleLimitActive`, `reorderContext`
- `listAffectedEntries({ source_kind, source_id, limit })` — trả về các bút toán đã liên kết qua `ai_rule_applications` (đã có sẵn cột `journal_entry_id`, chỉ thêm filter theo `source_*`).
- `retroApplyContextChange({ context_id, since })` — quét bút toán từ `since`, trả về preview các thay đổi đề xuất (KHÔNG tự đổi — chỉ tạo "đề xuất hàng loạt" để user duyệt).

Ngoài ra mở rộng `listAiMemory` để trả thêm `counts: { partners, context, limits }` cho header.

---

## 3. UI — 4 tab

Tách `ai.memory.tsx` thành các component con (file ngắn hơn): `RulesTab.tsx`, `PartnersTab.tsx`, `ContextTab.tsx`, `LimitsTab.tsx`, `LearningTab.tsx`.

### Đối tác

- Tìm kiếm + lọc theo loại (`customer`/`supplier`/`employee`).
- Mỗi card: tên đối tác + 1 câu hành vi + chip (TK mặc định, phòng ban, từ khoá memo).
- Sheet sửa: form Việt hoá, các field gợi ý từ dữ liệu giao dịch (autocomplete tài khoản, memo keywords).
- Nút **"Dùng ở đâu"** → mở `AppliedHistorySheet` (tái dùng) lọc theo `source_kind='partner'`.

### Bối cảnh DN

- Hiển thị theo nhóm `category` (Tổ chức / Kế toán / Thuế / Doanh thu / Ngân hàng / Phòng ban / Mô hình KD / HĐĐT).
- Mỗi mục: `label` bên trái, `value_text` editable inline (click để sửa, blur để lưu).
- Khi user sửa → toast hỏi **"Áp dụng hồi tố cho N bút toán?"** với link mở dialog preview retro-apply.

### Giới hạn

- Mỗi giới hạn là một card có công tắc bật/tắt.
- Badge mức độ (`block`/`warn`/`require_review`) màu khác nhau, dùng token `--destructive`/`--warning`/`--accent`.
- Cho phép tạo giới hạn mới qua dialog với form: chọn `scope` → render các field `params` tương ứng (ngưỡng tiền, mã TK, vendor…). Câu `rule_text` được auto-generate khi user nhập tham số (giống template engine của Rules).
- Hiển thị `triggered_count` + nút "Xem các lần đã chặn".

### Đang học (giữ nguyên, chỉ refactor)

---

## 4. "Time-travel cho trí nhớ"

Khi sửa Context (hoặc đổi giới hạn quan trọng):

1. Server fn `retroApplyContextChange` trả preview `{ affected_count, samples: [...] }`.
2. UI mở `AlertDialog`: liệt kê 5 bút toán mẫu, nút "Áp dụng hồi tố".
3. Nếu xác nhận → tạo các bản ghi "đề xuất điều chỉnh" trong inbox AI (không sửa trực tiếp sổ — tôn trọng quy tắc giới hạn "không xoá bút toán").

---

## 5. Bảo mật & RLS

- RLS chuẩn: `tenant_id = current_tenant_id()` cho `select/insert/update/delete`, role `owner|admin|accountant` mới được mutate. `viewer` chỉ đọc.
- Validate Zod tất cả input (min/max/regex như guideline).
- Không lộ service role; mọi mutation đi qua `createServerFn` + `withTenant`.

---

## 6. Cấu trúc file

```text
src/lib/
  ai-memory-partners.functions.ts   (mới)
  ai-memory-context.functions.ts    (mới)
  ai-memory-limits.functions.ts     (mới)
  ai-memory.functions.ts            (mở rộng counts + listAffectedEntries)

src/routes/_app/ai.memory.tsx       (chỉ điều phối tab + header)
src/components/ai-memory/
  RulesTab.tsx
  PartnersTab.tsx
  ContextTab.tsx
  LimitsTab.tsx
  LearningTab.tsx
  AffectedEntriesSheet.tsx          (tái dùng từ AppliedHistorySheet hiện tại)
  RetroApplyDialog.tsx

supabase/migrations/
  <ts>_ai_memory_partners_context_limits.sql
```

---

## 7. Phạm vi & ngoài phạm vi

**Trong phạm vi:** schema + RLS + seed mặc định, server fns, UI 3 tab mới, liên kết "dùng ở đâu", retro-apply ở mức tạo đề xuất.

**Ngoài phạm vi (đề nghị làm pha sau):**
- Tích hợp `Giới hạn` vào pipeline duyệt bút toán/thanh toán thật (chỉ trả về `allow|warn|block` từ một fn duy nhất; wiring vào từng màn cần loop riêng).
- Tích hợp `Bối cảnh DN` vào system prompt của AI Gateway (cần 1 PR riêng để chèn vào `src/lib/ai/system-prompt.ts`).
- Auto-learn `Đối tác` từ lịch sử giao dịch (job nền).

Bạn xác nhận phạm vi này nhé — sau khi bấm "Implement plan" mình sẽ chạy migration trước rồi mới wiring UI.
