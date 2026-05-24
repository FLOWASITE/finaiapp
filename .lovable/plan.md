## Mục tiêu
Mở rộng Agent Hạch toán xử lý hoá đơn bán ra (#3) và thêm vòng học chủ động từ lịch sử duyệt (#4).

---

## #3 — Hỗ trợ hoá đơn bán ra (cat-011)

### Bối cảnh
- Engine hiện đọc bảng `invoices` + `invoice_lines` (mua vào): Nợ 642/156/... / Có 331 + 133.
- Bảng `sales_invoices` + `sales_invoice_lines` đã tồn tại nhưng engine chưa biết → tỷ lệ coverage ~60%.
- Pattern bán ra chuẩn TT200: Nợ 131 (KH) / Có 511 (DT) + Có 3331 (VAT đầu ra).

### Thay đổi
1. **Engine: thêm flow "sales"**
   - File mới: `src/lib/categorize/sales-engine.server.ts`
     - `loadSalesInvoice(invoiceId)` đọc `sales_invoices` + lines
     - `classifySalesLine(line, customer)` map sản phẩm → 511* (511 hàng hoá / 5112 thành phẩm / 5113 dịch vụ) dựa vào `product_id.kind` hoặc heuristic mô tả
     - `composeSalesEntries(inv, classified)` → 1 entry với:
       - Nợ 131 (hoặc 111/112 nếu `payment_status='paid'`) = total
       - Có 511* = subtotal (gộp theo loại)
       - Có 3331 = vat_amount (nếu >0)
     - `proposeJournalForSalesInvoice(invoiceId)` + `proposeSalesJournalBatch(ids[])`
   - Phát warning mới `cat-011` khi không xác định được 511 phù hợp → fallback 5118.

2. **Cache reuse**
   - Thêm `getCustomerHistoryDist(tenantId, customerId)` (12 tháng) — giống supplier.
   - Bổ sung memory key `sales:<line_name_norm>` trong `ai_line_classifications` (đã có cột, chỉ thêm prefix khi ghi).

3. **Router phía Inbox**
   - `src/lib/inbox-ai.functions.ts`:
     - `listInboxAi` query thêm `sales_invoices` (cùng tenant, status='reviewed', chưa post) → `kind='sales_invoice'`.
     - `buildDocumentItem` nhánh sales gọi `proposeSalesJournalBatch`.
   - `approveProposal` / `skipProposal`: detect `kind` từ proposal.invoice_id (tra cả 2 bảng) hoặc thêm cột `invoice_kind` vào `categorize_proposals` (migration nhỏ).

4. **UI ProposalCard**
   - Hiển thị badge `Bán ra` / `Mua vào` ở header, đổi label "NCC" → "KH" khi sales.
   - Không phá layout hiện tại.

5. **Phạm vi KHÔNG đụng**
   - Không sửa luật cat-001…cat-010 hiện có.
   - Không sửa Chat AI flow.
   - Không sửa schema `sales_invoices`.

### Migration (nhỏ, 1 cột)
```sql
ALTER TABLE categorize_proposals
  ADD COLUMN invoice_kind TEXT NOT NULL DEFAULT 'purchase'
  CHECK (invoice_kind IN ('purchase','sales'));
```

### KPI kỳ vọng
- Coverage: 60% → ~95% volume hoá đơn.
- Sales proposals tự sinh khi vào Inbox AI mà không cần thao tác thêm.

---

## #4 — Vòng học chủ động (auto-promote rules)

### Bối cảnh
- Hiện `inbox_rules` chỉ được tạo thủ công qua nút "Lưu thành luật".
- `inbox_decisions` đã log mọi approve/edit kèm `final_entry`, `original_entry`.
- Nếu KTT approve cùng 1 pattern ≥3 lần → có thể tự promote thành rule để lần sau confidence bật cao ngay.

### Thay đổi
1. **Server function: `scanAndPromoteRules`**
   - File: `src/lib/learning/promote-rules.server.ts` + `.functions.ts` wrapper.
   - Logic per-tenant:
     - Lấy `inbox_decisions` 30 ngày gần nhất, action IN ('approve','edit','bulk_approve'), `rule_id IS NULL`.
     - Group theo `(partner_tax_id, primary_account_from_final_entry)`:
       - `partner_tax_id` trích từ `final_entry.metadata.party_tax_id` (đã có).
       - `primary_account` = tài khoản Nợ đầu tiên ≠ 133/3331/111/112/131/331.
     - Khi count ≥ 3 và chưa có rule trùng (partner + apply_account) → INSERT vào `inbox_rules`:
       - `pattern_kind='partner'`, `pattern_value=partner_tax_id`
       - `apply_account=<primary_account>`
       - `confidence_boost=30`, `note='Tự học từ N lần duyệt'`
     - Nếu KTT đã `edit` ≥2 lần và account khác với original_entry → ghi đè rule cũ (demote `hit_count` rule cũ, tạo rule mới).
   - Trả `{ promoted, demoted, scanned }`.

2. **Cron schedule (pg_cron + server route)**
   - Route mới: `src/routes/api/public/hooks/promote-rules.ts`
     - Header `apikey` = anon key (chuẩn pattern Lovable).
     - Loop tenant_ids đang active (có decision trong 7 ngày) → gọi `scanAndPromoteRules` từng tenant.
   - SQL `cron.schedule` chạy **mỗi ngày 02:00** (giờ Asia/Ho_Chi_Minh = 19:00 UTC).

3. **UI nhỏ trong Inbox AI**
   - Thêm badge "Auto-learned" trên ProposalCard khi proposal khớp rule có `note LIKE 'Tự học%'`.
   - Trang `/settings/rules` (nếu có) — thêm cột "Nguồn: Thủ công / Tự học".

4. **Invalidate cache**
   - Sau khi promote, gọi `invalidateCategorizeCache(tenantId)` để rule mới có hiệu lực tức thì.

5. **Phạm vi KHÔNG đụng**
   - Không sửa schema `inbox_rules`, `inbox_decisions`.
   - Không thay đổi cách ghi `inbox_decisions` hiện tại.
   - Không bật/tắt rule manual của user.

### KPI kỳ vọng
- Sau 2 tuần: 30–50% NCC quen có rule tự sinh → tỷ lệ band ≥85% tăng từ ~45% → ~70%.
- Số lần KTT phải "Sửa" giảm ~25%.

---

## Thứ tự thực hiện (đề xuất)
1. Migration `categorize_proposals.invoice_kind`.
2. Sales engine + batch + router Inbox → test với 1 sales invoice mẫu.
3. UI badge sales/purchase.
4. `promote-rules.server.ts` + serverFn.
5. Server route `/api/public/hooks/promote-rules` + SQL cron.
6. Badge "Auto-learned".

---

## Rủi ro & mitigations
- **Sales engine map sai 511***: fallback 5118 + warning cat-011, KTT vẫn sửa được trước khi duyệt.
- **Auto-promote tạo rule rác**: chỉ promote khi `count≥3` cùng partner+account, có thể nâng lên 5 nếu noise nhiều; mọi rule auto có `note` rõ để KTT review/disable.
- **Cron chạy lâu**: chia batch theo tenant, mỗi tenant query có LIMIT 1000 decisions, indexed sẵn `idx_inbox_decisions_recent`.
- **Race condition cache**: dùng `invalidateCategorizeCache` cuối job; người đang mở Inbox sẽ thấy rule mới ở lần fetch kế.

Anh duyệt plan này thì em chuyển sang build mode triển khai theo thứ tự trên.