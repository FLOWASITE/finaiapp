# Hoàn thiện Agent Hạch toán — Phase UI + Tích hợp

Backend engine + DB đã xong ở turn trước (`categorize/engine.server.ts`, `categorize.functions.ts`, `ai_journal_proposals`, `template_lines`). Phase này gắn engine vào pipeline thật và mở UI cho Kế toán trưởng duyệt hàng loạt.

## 1. Tích hợp engine vào pipeline có sẵn

**`src/lib/ai/parse-document.functions.ts`**
- Sau khi parse xong hoá đơn mua vào và tạo `invoices` row → gọi `autoPostIfEligible({ invoice_id })`.
- Nếu agent `categorize` ở mode `auto` và `confidence ≥ threshold`: tự `approveJournalEntry` + ghi log `agent_activity`.
- Ngược lại: chỉ tạo bản ghi `ai_journal_proposals` (status `pending`) để KTT duyệt sau.

**`src/lib/ai/inbox-reason.server.ts`**
- Thay heuristic `642/331` hard-code bằng `proposeJournalForInvoice` (engine mới).
- Map `JournalProposalDTO.entries[0].lines` → `Proposal.lines` cho inbox card; giữ signals/warnings.
- Inbox và `/invoices/$id` từ đây dùng chung 1 engine.

**`src/lib/journal.functions.ts`** (đã có `approveJournalEntry`)
- Hook sau approve: gọi `learnVendorTemplate(invoice_id, entries)` để cập nhật `ai_memory_partners.template_lines`.

## 2. Trang `/categorize` — Hàng đợi hạch toán

**`src/routes/_app/categorize.tsx`** — route mới dưới `_authenticated` layout
- Loader: `listProposals({ status: 'pending', limit: 50 })`.
- Layout: header thống kê (tổng chờ duyệt, auto-posted hôm nay, độ chính xác 7 ngày) + danh sách card.

**`src/components/categorize/ProposalCard.tsx`**
- Hiển thị: NCC, mô tả, tổng tiền, bảng bút toán Nợ/Có (giống `journal-proposal-card.tsx` đã có).
- Badge nguồn (`vendor_template` / `learned_lines` / `classify_rule` / `ai_fallback`).
- Confidence pill + warnings (cat-001 cảnh báo >20tr tiền mặt, cat-008, …).
- Nút: **Duyệt & ghi sổ** · **Sửa** (mở drawer) · **Bỏ qua** · **Mở hoá đơn gốc**.

**`src/components/categorize/ProposalDetailDrawer.tsx`**
- Cột trái: preview file hoá đơn (dùng `invoice-file-viewer.tsx` có sẵn).
- Cột phải: editor bút toán per-line (account picker dùng `coa.functions.ts`), nature picker, ghi chú.
- Nút Lưu → `approveProposal` với entries đã sửa → trigger `learnVendorTemplate`.

**Batch action**: checkbox + thanh "Duyệt N bút toán đã chọn" (chỉ enable cho card không có warning `error`).

## 3. Sidebar + AgentDetailDrawer

**`src/components/app-sidebar.tsx`**: thêm mục **Hạch toán** dưới nhóm AI, icon `Calculator`, badge số chờ duyệt (từ `sidebar-counts.functions.ts`).

**`src/components/ai-memory/agents/AgentDetailDrawer.tsx`**: tab "Cài đặt" cho agent `categorize` — chỉnh `mode` (off/suggest/auto), `confidence_threshold` slider, link đến `/categorize`.

## 4. Test cases

**`src/lib/categorize/engine.test.ts`**
- Server "Máy chủ Dell 45tr" → entry `Nợ 211 / Có 331` (không phải 642).
- Hoá đơn mixed (hàng + dịch vụ) → 2 entries riêng (rule cat-009).
- 3+ hoá đơn cùng NCC pattern giống → source = `vendor_template`, confidence ≥ 0.85.
- Tiền mặt 50tr → warning cat-001, confidence cap 0.7, `recommend_auto_post=false`.
- Hoá đơn ghi "điều chỉnh giảm" → cat-013 nature `mixed`, không auto-post.

## Files

**Tạo mới (4)**: `src/routes/_app/categorize.tsx`, `src/components/categorize/ProposalCard.tsx`, `src/components/categorize/ProposalDetailDrawer.tsx`, `src/lib/categorize/engine.test.ts`.

**Sửa (5)**: `src/lib/ai/parse-document.functions.ts`, `src/lib/ai/inbox-reason.server.ts`, `src/lib/journal.functions.ts`, `src/components/app-sidebar.tsx`, `src/components/ai-memory/agents/AgentDetailDrawer.tsx`.

**Không động**: XML export TT200, KTT override audit table, ML feedback loop (đã đồng ý để phase sau).

## Acceptance

1. Upload hoá đơn Dell 45tr → tự ghi sổ Nợ 211/Có 331 nếu agent ở mode auto.
2. `/categorize` hiển thị queue, duyệt 1 phát → bút toán xuất hiện trong `journal_entries`, `learnVendorTemplate` ghi vào `ai_memory_partners.template_lines`.
3. Inbox card và trang chi tiết hoá đơn cho ra cùng đề xuất bút toán.
4. Sidebar đếm số chờ duyệt realtime.
