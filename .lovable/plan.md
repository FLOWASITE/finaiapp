## Mục tiêu

Cho phép KTV bấm **Đồng ý / Từ chối** trên từng dòng hoá đơn (kèm lý do ngắn) ngay tại màn hình review. Phản hồi này:
1. Đóng vòng lặp học của `item_resolution_log` (đánh dấu `reviewed_by/reviewed_at`, lưu verdict + reason vào `signals`).
2. Cập nhật `supplier_item_mappings.confidence` / `match_count` khi approve gợi ý fuzzy → lần sau resolver tin tưởng hơn (cache hit).
3. Tự calibrate trọng số `W = { text, unit, price, history, sku }` của resolver fuzzy và ngưỡng `confidence` của classify-line heuristic dựa trên thống kê approve/reject gần đây của từng tenant.

Chỉ động vào lớp resolver và UI review. Không thay đổi journal, RLS, hay luồng duyệt bút toán.

## Phạm vi thay đổi

### 1. DB migration (nhẹ)

- Thêm cột vào `item_resolution_log`:
  - `verdict text` CHECK in (`approved`,`rejected`,`corrected`), nullable.
  - `feedback_reason text`, nullable.
  - `corrected_product_id uuid` FK products(id) ON DELETE SET NULL — khi KTV chọn sản phẩm khác.
  - `corrected_kind text` — khi KTV đổi LineKind (goods/ccdc/asset/service).
- Bảng mới `public.resolver_weight_profile`:
  - `tenant_id uuid PK FK tenants`, `w_text/w_unit/w_price/w_history/w_sku numeric`, `heuristic_min_conf numeric`, `sample_size int`, `updated_at timestamptz`.
  - RLS: select cho member, update/insert cho service_role (chỉ cron job calibrate ghi).
  - GRANT đầy đủ cho `authenticated` (select) và `service_role` (all).

### 2. Server functions mới (`src/lib/items/feedback.functions.ts`)

- `submitLineFeedback({ line_id, verdict, reason?, corrected_product_id?, corrected_kind? })`:
  - Tìm log gần nhất theo `invoice_line_id`, UPDATE `verdict`, `feedback_reason`, `corrected_*`, `reviewed_by=auth.uid()`, `reviewed_at=now()`.
  - Nếu `verdict='approved'` và log có `resolved_product_id`: upsert `supplier_item_mappings` (tăng `match_count`, set `confidence = min(0.99, confidence + 0.02)`, `source='user_confirm'`).
  - Nếu `verdict='rejected'`: giảm confidence mapping tương ứng (`max(0.3, confidence - 0.1)`); nếu `corrected_product_id` có → upsert mapping mới với `confidence=0.9`.
  - Nếu `corrected_kind` có → gọi `setLineOverrideKind`.
- `getLineFeedbackStats({ invoice_id })`: trả số dòng đã approve/reject/pending để UI hiển thị progress.

### 3. Calibration (`src/lib/items/calibrate-weights.server.ts` + server route cron)

- Hàm `calibrateForTenant(tenant_id)`:
  - Lấy log 30 ngày gần nhất có `verdict in (approved,rejected,corrected)`.
  - Với mỗi log, đọc `signals` đã lưu. Tính correlation đơn giản giữa từng signal và verdict (approved=+1, rejected=-1) → softmax-normalize thành trọng số mới, blend 70% baseline + 30% học.
  - Tính `heuristic_min_conf` = percentile 25 của `confidence` các log `approved` xuất phát từ `method='fuzzy'` score thấp; clamp [50, 85].
  - Upsert vào `resolver_weight_profile`. Cần `sample_size >= 20`, không thì giữ default.
- Server route `src/routes/api/public/cron/calibrate-resolver.ts` (POST, verify `X-CRON-SECRET`): chạy cho mọi tenant có ≥20 log mới trong 24h.
- `resolver.server.ts` đọc `resolver_weight_profile` của tenant ở đầu hàm `resolve`, fallback về hằng số `W` cũ. Ngưỡng `0.7/0.9` giữ nguyên; chỉ trọng số thay đổi.
- `resolve-line-kind.server.ts` đọc `heuristic_min_conf` để quyết định khi nào fallback classify được coi là đủ tin để auto vs review (ảnh hưởng UI badge, không ảnh hưởng account).

### 4. UI (`src/routes/_app/invoices/$id.tsx`)

- Mỗi dòng trong bảng resolved-lines thêm cụm 3 nút nhỏ:
  - ✓ **Đồng ý** → gọi `submitLineFeedback({verdict:'approved'})`.
  - ✗ **Từ chối** → mở popover textarea (lý do, optional select kind mới) → submit `rejected`/`corrected`.
  - Trạng thái hiện tại (badge): "Chờ duyệt" / "Đã đồng ý" / "Đã từ chối — <reason>".
- Sau mỗi submit, invalidate query `getResolvedInvoiceLines`.
- Thanh tổng ở header: `X/Y dòng đã review` (từ `getLineFeedbackStats`).
- Nút **Duyệt & ghi sổ** disable cho tới khi tất cả dòng có verdict (hoặc KTT bypass bằng nút "Bỏ qua review").

## Ngoài phạm vi

- Không đổi cấu trúc bảng `journal_lines`, `purchase_vouchers`.
- Không động vào tab "Agent của Fin" / Inbox AI.
- Không train model LLM; chỉ tinh chỉnh trọng số số học.
- Không backfill log cũ — calibrate chỉ dùng log mới có `verdict`.

## Thứ tự thực hiện

1. Migration (cột mới + bảng `resolver_weight_profile` + GRANT/RLS).
2. `feedback.functions.ts` + cập nhật `resolver.server.ts` đọc weight profile.
3. UI nút Đồng ý/Từ chối + popover lý do trên `invoices/$id.tsx`.
4. `calibrate-weights.server.ts` + cron route + secret `CRON_SECRET`.
5. QA: tạo 1 hoá đơn test, approve/reject vài dòng, gọi cron tay, kiểm tra `resolver_weight_profile` cập nhật và resolver dùng trọng số mới.
