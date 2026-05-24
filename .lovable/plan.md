# Kế hoạch tiếp tục: Hoàn tất #3 và triển khai #4

## Phần A — Tích hợp Sales Invoice vào luồng Inbox AI (#3 phần 2)

### A1. Mở rộng `listInboxAi` (src/lib/inbox-ai.functions.ts)
- Query thêm `sales_invoices` (status='reviewed', chưa post) song song với `invoices`.
- `buildDocumentItem` nhận thêm `invoice_kind: 'purchase' | 'sales'`.
- Khi `kind='sales'` → gọi `proposeSalesJournalBatch` thay vì engine mua.
- Merge 2 danh sách, sort theo `invoice_date DESC`.

### A2. Cập nhật `approveProposal` / `saveProposal` (src/lib/categorize.functions.ts)
- Đọc/ghi `categorize_proposals` với cặp khóa `(invoice_kind, invoice_id)`.
- Khi approve sales → tạo `journal_entries` + `journal_entry_lines` với `source_type='sales_invoice'`, set `sales_invoices.posted_at`.
- Bảo toàn logic mua hiện tại (không đổi behavior cũ).

### A3. UI Badge "Bán ra / Mua vào" (src/components/categorize/ProposalCard.tsx + danh sách Inbox)
- Badge màu xanh cho "Bán ra", màu cam cho "Mua vào" cạnh tên đối tác.
- Đổi label "NCC" → "KH" khi `invoice_kind='sales'`.
- Hiển thị warning `cat-011` (fallback 5118) rõ ràng.

## Phần B — Auto-Promote Rules từ `inbox_decisions` (#4)

### B1. Server function: `src/lib/learning/promote-rules.server.ts` + `.functions.ts`
- `scanAndPromoteRules(tenantId)`:
  - Lấy `inbox_decisions` 30 ngày, `rule_id IS NULL`, action ∈ ('approve','edit','bulk_approve').
  - Group theo `(partner_tax_id, primary_debit_account)` từ `final_entry`.
  - Promote khi count ≥ 3 → insert `inbox_rules` với `confidence_boost=30`, `note='Tự học từ N lần duyệt'`, `source='auto'`.
  - Demote: nếu cùng partner có ≥2 edit đổi account khác rule cũ → set `inbox_rules.disabled_at`.
  - Invalidate cache categorize cuối job.

### B2. Cron route: `src/routes/api/public/hooks/promote-rules.ts`
- POST handler, verify `apikey` header = anon key.
- Loop active tenants (LIMIT 1000) → gọi `scanAndPromoteRules`.
- Log kết quả `{tenant_id, promoted, demoted}`.
- pg_cron 02:00 UTC daily (insert tool, không phải migration).

### B3. Schema mở rộng (migration nhỏ)
- `inbox_rules`: thêm cột `source TEXT DEFAULT 'manual' CHECK (source IN ('manual','auto'))`, `note TEXT`, `disabled_at TIMESTAMPTZ`.
- Index `(tenant_id, partner_tax_id) WHERE disabled_at IS NULL`.

### B4. UI hiển thị nguồn rule
- Trong `ProposalCard`: badge "Auto-learned" khi `applied_rule.source='auto'`.
- Trang `/settings/rules`: cột "Nguồn" (Thủ công / Tự học) + filter.

## Kỹ thuật & rủi ro
- Sales integration không đụng schema `invoices`/`journal_entries` (đã có `source_type`).
- Auto-promote: ngưỡng 3 lần có thể nâng lên 5 nếu nhiễu; mọi rule auto có `note` rõ để KTT review.
- Cron batched per tenant, mỗi query LIMIT 1000, dùng index `idx_inbox_decisions_recent` đã có.
- Cache invalidate cuối job tránh race.

## KPI dự kiến
- #3: Inbox AI cover được hóa đơn bán → coverage 60%→~95%.
- #4: Sau 2 tuần, ~30-50% NCC có auto-rule → tỷ lệ band≥85% tăng ~45%→~70%, edit giảm ~25%.

## Thứ tự thực thi
1. A1 + A2 (integration sales) → 1 batch
2. A3 (UI badges) → 1 batch
3. B3 (migration schema) → chờ approve
4. B1 + B2 (server + cron route) → 1 batch
5. B4 (UI rules) → 1 batch
6. Insert pg_cron schedule → cuối cùng

Duyệt để mình bắt đầu A1+A2?