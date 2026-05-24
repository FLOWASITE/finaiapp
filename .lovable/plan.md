# Confidence Calibration Loop

Mục tiêu: từ lịch sử `inbox_decisions`, tự động hiệu chỉnh **(a)** ngưỡng auto-post của từng tenant và **(b)** trọng số các signals trong engine, để `confidence` thực sự khớp với tỷ lệ approve không-edit.

---

## 1. Schema mới

### `confidence_calibration` (per tenant)
- `tenant_id` (PK)
- `auto_threshold` numeric(4,3) default 0.85 — ngưỡng auto-post hiện hành
- `review_threshold` numeric(4,3) default 0.60 — dưới mức này → escalate manual
- `signal_weights` jsonb — `{vendor_template, learned_memory, classify_rule, partner_history, vat_match, ai_fallback, has_warning, missing_partner}` (mỗi key là delta cộng/trừ vào base confidence)
- `sample_size` int — số decision dùng để fit lần cuối
- `accuracy_auto` numeric(4,3) — precision band auto kỳ vừa rồi
- `accuracy_review` numeric(4,3)
- `last_calibrated_at` timestamptz
- RLS: select tenant member, write chỉ owner/admin (đa số chỉ cron ghi qua service role)

### `calibration_runs` (audit log)
- `id`, `tenant_id`, `ran_at`, `window_days`, `sample_size`, `old_threshold`, `new_threshold`, `old_weights` jsonb, `new_weights` jsonb, `metrics` jsonb (precision/recall/edit_rate theo band), `note` text
- Để trace drift theo thời gian, hiển thị ở Settings.

### Cột mới trong `ai_journal_proposals` (đã có `confidence`, `source`)
- Thêm `signals` jsonb default `{}` — engine ghi lại các signals đã kích hoạt (vendor_template=true, partner_history=0.8, vat_match=true, warning_codes=[...]) để calibration job có dữ liệu fit.

---

## 2. Engine đọc calibration

### `src/lib/categorize/calibration.server.ts` (mới)
- `getCalibration(tenantId)` — cache 60s qua `cache.server.ts`, fallback default nếu chưa có row.
- `applySignalWeights(baseConfidence, signals, weights)` — trả về confidence đã calibrated, clamp [0, 0.99].
- `decideBand(confidence, cal)` → `'auto' | 'review' | 'manual'`.

### Update `engine.server.ts` + `sales-engine.server.ts`
- Thay vì hard-code `0.85` / `0.7` / `0.4`, thu thập signals vào object, gọi `applySignalWeights`.
- Lưu `signals` vào DTO của proposal khi insert vào `ai_journal_proposals` (cột mới).
- `recommend_auto_post = confidence >= cal.auto_threshold && agent.mode === 'auto'`.

### Update `agent_settings` đọc `confidence_threshold`
- Vẫn giữ `agent_settings.confidence_threshold` làm **floor do user set tay**; `auto_threshold` từ calibration là **gợi ý**. Engine dùng `max(user_floor, calibrated_threshold)` để không bao giờ tự nới lỏng dưới mức user yêu cầu.

---

## 3. Calibration job

### `src/lib/learning/calibrate.server.ts` (mới)
Logic:
1. Lấy 30 ngày `inbox_decisions` của tenant kèm `confidence_at_decision`, `action`, `original_entry.signals` (cần join hoặc lưu sẵn).
2. Tính cho mỗi band hiện tại:
   - `precision_auto = approve_count / total_auto` (approve = action 'approve' hoặc 'bulk_approve' không có edit).
   - `edit_rate_review = edit_count / total_review`.
3. **Hiệu chỉnh ngưỡng**:
   - Nếu `precision_auto < 0.92` → nâng `auto_threshold += 0.03` (max 0.95).
   - Nếu `precision_auto >= 0.97` và `edit_rate_review < 0.15` → hạ `auto_threshold -= 0.02` (min 0.75).
   - Tương tự `review_threshold` dựa trên tỷ lệ skip ở band review.
4. **Hiệu chỉnh trọng số signals** (logistic regression nhẹ tay, không cần lib):
   - Với mỗi signal `s`, tính `P(approve | s=true)` và `P(approve | s=false)`, delta = `logit(p_true) - logit(p_false)` chia 4 để giữ nhỏ.
   - Clamp mỗi weight trong `[-0.2, +0.2]`.
   - Chỉ apply khi sample của signal đó ≥ 20.
5. Yêu cầu `sample_size >= 30` mới ghi; nếu ít hơn thì giữ nguyên + ghi log "insufficient sample".
6. Ghi `calibration_runs`, upsert `confidence_calibration`, invalidate cache (`cache.server.ts`).

### `src/lib/learning/calibrate.functions.ts`
- `runCalibrationForTenant({ tenantId })` (owner/admin) — trigger thủ công từ Settings.
- `getCalibrationStatus({ tenantId })` — trả về current thresholds, weights, last metrics, history 10 runs gần nhất.

---

## 4. Cron hook

`src/routes/api/public/hooks/calibrate-confidence.ts`
- POST, header `apikey` = anon key.
- Lặp qua tenants có ≥30 decisions trong 30 ngày, gọi `scanAndCalibrate(tenantId)`.
- Chạy **02:30 UTC** hằng ngày (sau `promote-rules` 02:00) để dùng rules mới khi tính metrics.
- pg_cron schedule qua `supabase--insert`.

---

## 5. UI

### Trang `/settings/ai-calibration` (mới, link từ Settings)
- Card "Ngưỡng hiện tại": auto_threshold / review_threshold (slider read-only + nút "Override thủ công" → ghi vào `agent_settings.confidence_threshold`).
- Card "Độ chính xác kỳ vừa rồi": precision band auto, edit rate band review, sample size, ngày calibrate cuối.
- Bảng "Lịch sử calibration" (10 runs): ngày, threshold cũ→mới, precision, sample.
- Nút "Chạy calibration ngay" → gọi `runCalibrationForTenant`.
- Hiển thị trọng số signals dạng bar chart đơn giản (positive xanh / negative đỏ).

### Badge trong `ProposalCard.tsx`
- Khi `proposal.signals` có entry mạnh (ví dụ `vendor_template=true`), hiển thị chip nhỏ "Theo mẫu NCC" / "Học từ lịch sử" để user hiểu vì sao confidence cao.

---

## Thứ tự thực hiện
1. **Migration**: tạo `confidence_calibration`, `calibration_runs`, thêm cột `signals` vào `ai_journal_proposals` + RLS.
2. **`calibration.server.ts`** + update engine (purchase + sales) để emit signals và đọc calibration.
3. **`calibrate.server.ts`** (logic fit) + `calibrate.functions.ts`.
4. **Cron route** + insert pg_cron schedule 02:30 UTC.
5. **UI `/settings/ai-calibration`** + chip signals trong ProposalCard.

## KPI dự kiến
- Sau 2 tuần dữ liệu: precision band auto ổn định ≥95% trong khi tăng coverage auto từ ~30% → ~50%.
- Edit rate band review giảm ~30% nhờ trọng số signals chuẩn hơn.
- Drift detection: nếu precision tụt dưới 0.9, threshold tự nâng → tránh sai hệ thống.

Mình implement luôn theo thứ tự trên?
