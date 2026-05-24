## Mục tiêu
Triển khai 3 tối ưu cho Agent Hạch toán theo thứ tự ưu tiên ROI cao nhất, gộp 1 sprint vì 3 việc bổ trợ nhau (cache cần để batch nhanh, batch trả thêm signals để UI explain rõ).

- **#1 Cache** memory + vendor template theo tenant → giảm query DB lặp lại
- **#2 Batch** `proposeJournalForInvoice` → 1 round-trip cho N hoá đơn
- **#6 Explainability UI** → ProposalCard hiển thị top signals + alternative

Không đụng business logic phân loại / VAT — chỉ tối ưu I/O và bổ sung UI.

---

## 1. Cache layer (`src/lib/categorize/cache.server.ts` — mới)

In-memory LRU cache (Map đơn giản, TTL 5 phút) per Worker instance, key theo `tenant_id`:

- `getMemoryMap(supabase, tenantId, lineNorms[])` → cache toàn bộ `ai_line_classifications` của tenant (max 5000 dòng/tenant), filter `line_name_norm` trong memory
- `getVendorTemplates(supabase, tenantId)` → cache `ai_memory_partners` (party_kind=supplier, sample_count≥3) → lookup theo supplier_name trong memory thay vì query `ilike` từng lần
- `getSupplierIndustry(supabase, tenantId, supplierId)` → cache `suppliers.vsic_code`
- `getHistoryDist(supabase, tenantId, taxId|supplierId)` → cache phân bố 12 tháng

API:
```ts
export const categorizeCache = {
  invalidate(tenantId: string): void;          // gọi sau approve/reject
  getMemoryMap(...): Promise<Map<...>>;
  getVendorTemplates(...): Promise<VendorTpl[]>;
  // ...
};
```

Invalidation: gọi `categorizeCache.invalidate(tenantId)` trong `approveProposal`, `skipProposal`, `saveInboxRule` (file `categorize.functions.ts` + `inbox-ai.functions.ts`).

**Lưu ý Worker**: LRU sống trong process memory của isolate hiện tại. TTL ngắn (5 phút) đủ ấm cho 1 session Inbox, không gây stale lâu.

---

## 2. Batch API (`src/lib/categorize/engine.server.ts` — mở rộng)

Thêm hàm mới (không xoá hàm cũ để giữ tương thích):

```ts
export async function proposeJournalBatch(
  supabase, invoiceIds: string[]
): Promise<Map<string, JournalProposalDTO>>
```

Pipeline batch:
1. Load tất cả invoices + invoice_lines bằng 2 query `.in("id", invoiceIds)` (thay vì N×2)
2. Gọi 1 lần `categorizeCache.getMemoryMap` / `getVendorTemplates` / etc. cho tenant
3. Loop từng invoice trong memory — `tryVendorTemplate` / `classifyLines` / `composeEntries` đọc từ cache, không hit DB

Cập nhật `listInboxAi` trong `src/lib/inbox-ai.functions.ts`:
- Thu thập `invoice_id` của tất cả documents có `invoice_id`
- Gọi `proposeJournalBatch` 1 lần
- Trong `buildDocumentItem`, truyền proposal đã build sẵn vào (thêm tham số optional `prebuiltProposal?: JournalProposalDTO`)

Giữ `proposeJournalForInvoice` cho call lẻ (chat AI, approve recompute).

---

## 3. Explainability UI (`ProposalCard.tsx` — mở rộng)

Trên DTO `JournalProposalDTO` đã có `signals: ProposalSignal[]` (`label`, `weight`, `ok`) và `alternatives: ProposalAlternative[]`. Hiện UI không render gì.

Thêm vào ProposalCard:

**a) Section "Vì sao AI đề xuất" (collapsible)**
- Hiển thị top-5 signals sort theo `weight` desc
- Mỗi signal: icon (✓ xanh nếu `ok`, ⚠ vàng nếu không), label, badge `+{weight}`
- Header: "Độ chính xác: {confPct}% · {signals.length} tín hiệu"

**b) Tooltip "Độ chính xác band này"**
- Hover trên badge confidence → tooltip nhẹ giải thích band (high ≥88% / medium 60-87% / low <60%)
- Phase 1 hardcode text; phase 2 (ngoài plan) sẽ replace bằng số precision thực từ `inbox_decisions`

**c) Section "Phương án khác" (chỉ hiện khi `alternatives.length > 0`)**
- List các bút toán alternative với confidence của từng cái
- Nút "Dùng phương án này" → set vào state `entries` + bật `edit` mode

**d) Warnings hiển thị rõ ràng hơn**
- Tách warnings theo severity: error (đỏ, block auto-post), warn (vàng), info (xám)
- Hiện trên đầu card thay vì lẫn trong body

Component mới tách ra: `src/components/categorize/ProposalSignals.tsx` để giữ ProposalCard gọn.

---

## Chi tiết kỹ thuật

**File thay đổi:**
- ➕ `src/lib/categorize/cache.server.ts` — mới
- ✏️ `src/lib/categorize/engine.server.ts` — thêm `proposeJournalBatch`, refactor 4 hàm hiện có để nhận cache làm tham số optional
- ✏️ `src/lib/inbox-ai.functions.ts` — gọi batch + truyền prebuilt vào buildDocumentItem
- ✏️ `src/lib/ai/inbox-reason.server.ts` — `buildDocumentItem` nhận `prebuiltProposal?`
- ✏️ `src/lib/categorize.functions.ts` — gọi `categorizeCache.invalidate(tenantId)` sau approve/skip
- ➕ `src/components/categorize/ProposalSignals.tsx` — mới
- ✏️ `src/components/categorize/ProposalCard.tsx` — render Signals component + warnings phân loại

**Không đụng:**
- Logic `classifyLine`, `composeEntries`, VAT rules, threshold confidence
- Database schema (không cần migration)
- Chat AI flow

**KPI kỳ vọng (đo bằng `console.time` trước/sau):**
- `listInboxAi` latency: 800ms → ~200ms với 30 docs
- DB query count: ~120 → ~8 cho cùng workload
- UX: KTT thấy ngay "vì sao" → tăng tỷ lệ approve không edit

---

## Rủi ro & mitigation

| Rủi ro | Mitigation |
|---|---|
| Cache stale sau approve | Explicit invalidate trong tất cả mutation endpoints |
| Memory leak Worker | LRU cap 50 tenant × 5000 rows, TTL 5 phút |
| Batch fail 1 invoice → fail cả batch | Try/catch per-invoice, trả `Map` chỉ chứa proposal thành công |
| Signals quá nhiều làm rối UI | Default collapsed, chỉ hiện top-5, có nút "Xem tất cả" |
