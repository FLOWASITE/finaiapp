# Plan: Trí nhớ AI 4 tầng — vòng đời, conflict, global, auto-post

## Hiện trạng (đã có trong code)
- **T1 (NCC + mặt hàng → product/TK)**: `supplier_item_mappings` + `resolver.server.ts` Layer 1 (cache auto khi conf ≥ 0.95 & count ≥ 1, hoặc ≥ 0.9 & ≥ 3).
- **T3 (mục đích chi Loại B)**: `typeb_purpose_catalog` + cột `purpose_code` trên `supplier_item_mappings`.
- **T4 (negative)**: `ai_rule_penalties` (rule + memory) + `feedback-decay.ts` cron — nhưng chỉ áp dụng cho rule, chưa chặn gợi ý sai ở tầng mapping.
- **Học rule**: `learn-rules.server.ts` (vendor→TK).
- **Calibration**: `learning/calibrate.server.ts` cập nhật confidence rule.

## Còn thiếu (chính là phạm vi plan này)
1. **T2 (default cấp NCC)** chưa có bảng riêng — đang phải suy ra runtime.
2. **Conflict resolution**: hiện ghi đè last-write; chưa có recency-weighted, chưa hạ confidence khi mâu thuẫn.
3. **Decay**: mapping không tự suy giảm khi lâu không dùng; chỉ rule có.
4. **Negative memory cho mapping**: KTV bác gợi ý → chưa có log để Fin "không đề xuất lại".
5. **Global registry NCC** (MST → tên, ngành) chia sẻ liên tenant — chưa có.
6. **Auto-post threshold** per-tenant (confidence ≥ X% AND amount ≤ Y VND) — chưa cấu hình được.

---

## Phase 1 — Vòng đời + Conflict (T1, T3)
**DB migration**
- Thêm cột vào `supplier_item_mappings`:
  - `correction_count int default 0`, `last_correction_at timestamptz`
  - `archived_at timestamptz` (khi correction_rate > 30% và count ≥ 5)
  - `vote_log jsonb default '[]'` — lưu tối đa 10 lần chọn gần nhất `[{product_id, purpose_code, at, by}]` để tính recency-weighted vote.
- Trigger/function `fn_recency_weighted_winner(vote_log)` PL/pgSQL: trọng số `exp(-Δdays/30)`.

**Code**
- `src/lib/items/mappings.functions.ts` — `confirmItemMapping`:
  - Append vào `vote_log`, gọi `fn_recency_weighted_winner` để chọn winner.
  - Nếu winner khác lựa chọn hiện hành → **hạ confidence xuống 0.7** (dưới ngưỡng auto), tăng `correction_count`, log negative event.
  - Nếu winner trùng → tăng `confidence` (cap 0.99), tăng `match_count`.
- `resolver.server.ts` Layer 1: bỏ qua mapping có `archived_at IS NOT NULL`.

**Decay job**
- Mở rộng `routes/api/public/hooks/feedback-decay.ts`:
  - Mapping không `last_seen` > 180 ngày → `confidence *= 0.9` mỗi 30 ngày.
  - Khi `confidence < 0.5` → loại khỏi auto (vẫn còn để gợi ý).

## Phase 2 — T2: Default cấp NCC
**DB migration**
- Bảng mới `supplier_default_routing(tenant_id, supplier_id, line_kind, purpose_code, debit_account, confidence, sample_count, last_seen)` PK `(tenant_id, supplier_id, line_kind)`.
- Job aggregate (chạy cùng `learn-rules`): khi ≥ N=5 mapping của 1 NCC đổ về cùng `purpose_code`/`debit_account` → upsert vào bảng này với confidence = tỷ lệ đồng thuận.

**Code**
- `resolver.server.ts`: chèn **Layer 1.5** giữa cache và fuzzy — đọc `supplier_default_routing` khi mặt hàng mới của NCC quen, trả `status: "review"` với best candidate đã có TK đề xuất.

## Phase 3 — T4: Negative memory cho mapping
**DB migration**
- Bảng `supplier_item_rejections(tenant_id, supplier_id, raw_name_norm, rejected_product_id, rejected_purpose_code, count, last_at)`.

**Code**
- Khi KTV chọn khác với gợi ý của Fin trong sheet Inbox → ghi vào bảng này (qua `mappings.functions.ts`).
- `resolver.server.ts`: trước khi trả candidates, lọc bỏ những `product_id`/`purpose_code` có rejection ≥ 2 lần cho cùng `(supplier, raw_name_norm)`.

## Phase 4 — Global NCC registry (CHỈ danh tính, ẩn danh)
**DB migration**
- Bảng `global_supplier_registry(tax_id PK, display_name, industry_code, industry_name, confidence, contributor_count, first_seen, last_seen)`.
- Bảng `global_supplier_contributions(tax_id, tenant_id, display_name, industry_code, at)` UNIQUE `(tax_id, tenant_id)` — để aggregate có audit, KHÔNG lộ tenant nào đóng góp.
- RLS: registry **SELECT công khai cho authenticated**; contributions chỉ service_role.
- Function `fn_aggregate_global_registry()` chạy daily: cho mỗi `tax_id` xuất hiện ở ≥ 2 tenant → upsert vào registry với name/industry phổ biến nhất.

**Code**
- Khi tạo supplier mới (có `tax_id`) → ghi contribution.
- `suppliers/$id.tsx` & onboarding NCC: gọi `lookupGlobalSupplier(tax_id)` để autofill `display_name`, `industry_code` nếu trống.
- **KHÔNG** share cách hạch toán hay default account.

## Phase 5 — Auto-post threshold per-tenant
**DB migration**
- Thêm vào `tenants` (hoặc bảng settings): `auto_post_min_confidence numeric default 0.95`, `auto_post_max_amount numeric default 5000000`, `auto_post_enabled boolean default false`.
- Hard guard (bypass cả khi enabled): luôn đẩy KTV nếu `has_fct`, lần đầu thấy NCC, hoặc mapping có `vote_log` mâu thuẫn trong 30 ngày.

**Code**
- `src/lib/ai/inbox-reason.server.ts`: sau khi resolve, kiểm tra threshold + hard guards → set `status: "auto"` thay vì "review".
- UI Cài đặt (Trí nhớ AI → "Tự động duyệt"): 2 input slider + toggle, badge "Đang BẬT auto-duyệt" trên Inbox khi enabled.
- Log mọi auto-post vào `agent_feedback_events` với `source: "auto"` để KTT review.

---

## Verification
- Migration chạy qua linter, không có warning.
- Resolver vẫn pass test hiện hành (Layer 1 cache vẫn auto đúng).
- Test thủ công: tạo 3 hóa đơn cùng NCC + cùng mặt hàng → lần 3 phải auto. Sửa lần 4 khác đi → confidence rớt < 0.95, lần 5 ra review queue.
- Test negative: bác gợi ý 2 lần → lần 3 candidate đó biến mất.
- Test global: tạo NCC mới với MST đã có ở tenant khác → autofill tên + ngành.
- Cấu hình auto-post `0.99 & 1tr` → hóa đơn 500k confidence 0.99 auto; hóa đơn 2tr không auto.

## Out of scope
- LLM-as-judge cho conflict (giữ deterministic).
- Cross-tenant sharing cách hạch toán (vi phạm privacy theo policy).
- UI dashboard "sức khỏe trí nhớ" — có thể làm phase sau.
