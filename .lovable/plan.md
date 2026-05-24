
# Hoàn thiện Agent Hạch toán

## Bối cảnh — những gì đang có

Sau khi rà soát code, đây là bức tranh thật:

**Đã có và đang chạy tốt:**
- `src/lib/ai/classify-line.ts` — rule-based classifier per line (goods/CCDC/TSCĐ/service), có history-by-vendor, vsicToKindHint, signals + confidence. **Mạnh nhưng đang bị bỏ phí.**
- Bảng `ai_line_classifications` + `lookupLineClassifications` / `saveLineClassification` — memory phân loại đã học per (tenant, vendor, line_name_norm).
- Bảng `ai_memory_partners` (default_account, sample_count, memo_keywords) — **vendor template thô đã có nhưng pipeline không dùng**.
- `inbox-reason.server.ts buildDocumentItem` — đang sinh proposal cho /inbox nhưng **chỉ ra 1 dòng Nợ 642 + 133 / Có 331 mặc định**, không gọi `classifyLine`, không đọc memory.
- `journal.functions.ts suggestJournalEntry` — gọi AI Gemini top-3 cho /invoices/$id (chậm, đắt) và `approveJournalEntry` (ghi sổ + auto nhập kho/TSCĐ).
- Bảng `ai_agents` lưu `mode` (auto/suggest/learn_only) + `confidence_threshold` per tenant. **Pipeline đang không đọc → mode "auto" chưa bao giờ có hiệu lực.**
- `inbox_rules` + `applyRule` đã chạy ở buildDocumentItem.
- Bảng `ai_agent_activity_logs` + realtime feed đã hoạt động.

**Khoảng trống thật sự:**
1. Hai builder song song cho cùng nhiệm vụ → cùng 1 hoá đơn, /invoices/$id và /inbox đề xuất khác nhau.
2. `classifyLine` + `ai_line_classifications` + `ai_memory_partners` không nối vào proposal builder → mọi HĐ chui hết vào 642 dù line là TSCĐ.
3. Không có vendor template thật (lưu bút toán mẫu, không chỉ 1 mã TK).
4. Mode `auto` chưa kích hoạt auto-post bao giờ.
5. Quy tắc cat-008 (chi không hợp lệ → 811), cat-009 (tách bút toán đa bản chất), cat-012 (CKTM 5211), cat-013 (HĐ điều chỉnh TT78) chưa cài.
6. Không có trang chuyên dụng để KTT duyệt hàng loạt hoá đơn chờ hạch toán — phải đi qua /inbox (lẫn ngân hàng + AI alert) hoặc /invoices/$id (mỗi lần 1 cái).

## Thiết kế

Một **engine thống nhất** thay cả 2 builder hiện tại. Pipeline 6 bước, mỗi bước có thể trả early:

```text
proposeJournalForInvoice(invoice_id)
  1. Load: invoice + lines + supplier + tenant agent settings
  2. Thử Vendor Template (ai_memory_partners.template_lines, sample_count ≥3)
       → trả entry full + confidence 0.95 + source: 'vendor_template'
  3. Per line: lookupLineClassifications (memory) → fallback classifyLine (rules)
       → ra map line → {kind, account, confidence}
  4. Áp rule nghiệp vụ: splitByNature (cat-009), checkVat (cat-001),
                       nonDeductible→811 (cat-008), CKTM (cat-012)
  5. Compose bút toán: gom theo account, thêm Nợ 133, thêm Có 331/111/112
       → trả entries[] + warnings[] + alternatives[] + source: 'learned_lines' | 'classify_rule'
  6. Nếu fail toàn bộ → AI fallback (suggestJournalEntry hiện tại) + flag low conf
```

Engine trả DTO chuẩn — cả /invoices/$id, /inbox, và trang mới /categorize đều gọi cùng 1 hàm này.

**Auto-post** = wrapper: nếu agent.mode = 'auto' và confidence ≥ threshold → gọi `approveJournalEntry` luôn + log activity "Auto-post HĐ X theo vendor template".

**Vendor template** học sau mỗi approve: nếu cùng vendor có ≥3 entry với cấu trúc (số dòng + account codes + tỷ lệ) tương đương → upsert `ai_memory_partners.template_lines` (jsonb mới).

## File deliverables

### Migration

`supabase/migrations/<timestamp>_categorize_engine.sql`:
- `ALTER TABLE ai_memory_partners ADD COLUMN template_lines jsonb` — bút toán mẫu (không chỉ 1 mã TK).
- `ALTER TABLE ai_memory_partners ADD COLUMN template_version int DEFAULT 0`.
- Bảng `ai_journal_proposals` cache proposal: `id, tenant_id, invoice_id, dto jsonb, confidence numeric, source text, auto_posted bool, created_at` + RLS theo tenant + index trên `(tenant_id, invoice_id)`.

### Backend

1. `src/lib/categorize/engine.server.ts` — `proposeJournalForInvoice()`, core engine 6 bước, pure (nhận supabase + invoice_id, trả DTO).
2. `src/lib/categorize/rules.ts` — pure helpers: `splitByNature`, `checkVatDeductibility` (cat-001), `applyNonDeductibleAccount` (cat-008), `detectAdjustmentInvoice` (cat-013), `vendorTemplateMatch`.
3. `src/lib/categorize/templates.server.ts` — `learnVendorTemplate(invoice_id)`: chạy sau approve, đếm pattern cùng vendor, upsert `ai_memory_partners.template_lines` khi ≥3.
4. `src/lib/categorize.functions.ts` — server functions:
   - `proposeJournal({invoice_id})` → gọi engine + lưu `ai_journal_proposals`
   - `listProposals({status, supplier, min_conf, limit})` → cho UI queue
   - `approveProposal({proposal_id, edits?})` → gọi `approveJournalEntry` + `learnVendorTemplate` + log
   - `bulkApprove({proposal_ids[]})` → loop
   - `autoPostIfEligible({invoice_id})` → wrapper cho parse pipeline
5. `src/lib/ai/parse-document.functions.ts` (sửa) — sau khi parse xong, gọi `autoPostIfEligible` (chỉ chạy nếu agent.mode='auto').
6. `src/lib/ai/inbox-reason.server.ts` (sửa) — `buildDocumentItem` chuyển sang gọi `engine.proposeJournalForInvoice` thay vì heuristic 1-dòng cứng.
7. Test: `src/lib/categorize/engine.test.ts` — 8 case (TSCĐ, mixed, vendor known, VAT cash >20tr, MST sai, CKTM, điều chỉnh, fallback AI).

### UI

8. `src/routes/_app/categorize.tsx` — trang Hạch toán:
   - Header: stat (chờ duyệt / auto-post hôm nay / accuracy 7 ngày) + nút "Duyệt tất cả conf ≥ 90%"
   - Filter: NCC, ngưỡng confidence, source (vendor_template/learned/rule/AI)
   - List: card per proposal với mini-table bút toán + badge source + nút Duyệt/Sửa/Bỏ
   - Side panel khi click: invoice viewer + tab `Lý do` (signals) + tab `Phương án khác`
9. `src/components/categorize/ProposalCard.tsx`, `ProposalDetailDrawer.tsx`, `EntryEditor.tsx`.
10. `src/components/app-sidebar.tsx` — thêm mục "Hạch toán" (icon Calculator) giữa Sổ AI và Sổ nhật ký.
11. `src/components/ai-memory/agents/AgentDetailDrawer.tsx` (sửa) — tab Settings của agent Categorize: thêm tooltip giải thích auto-post + link "Xem hàng đợi" → /categorize.

## Acceptance

- Hoá đơn 1 dòng "Máy chủ Dell 45 triệu" → engine ra `Nợ 211 / Có 331` (không phải 642).
- Hoá đơn mixed (NVL 5tr + tư vấn 10tr) → 2 bút toán riêng (cat-009).
- NCC đã có ≥3 bút toán pattern giống → lần 4 auto-post nếu mode=auto, log "Auto-post theo template".
- Hoá đơn 50tr trả tiền mặt → warning "Không khấu trừ VAT (cat-001)", confidence cap 0.7.
- /categorize hiện queue, batch approve, edit inline, signal panel.
- Activity feed của agent Hạch toán có log mới mỗi lần đề xuất / auto-post.

## Ngoài phạm vi (làm sau)

- Export MISA/Fast/Bravo XML TT200.
- KTT override audit table riêng (cat-015) — tạm thời reuse `ai_suggestions.feedback`.
- VAS 17 thuế hoãn lại (cat-014).
- ML feedback loop để cải thiện engine theo accuracy.
