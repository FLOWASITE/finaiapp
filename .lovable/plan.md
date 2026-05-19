## Tầm nhìn

Thay "Hộp việc 5-thẻ điều hướng menu" hiện tại bằng **Sổ AI** — một dòng inbox hợp nhất (giống email) nơi mọi hoá đơn TCT, sao kê ngân hàng, email forward, cảnh báo AI đã được AI hạch toán sẵn. Người dùng không **làm** — chỉ **duyệt**. Mỗi mục là một "đề xuất có lập luận" (proposal-with-reasoning), không phải form trống.

Layout 3 vùng theo mockup đính kèm:

```text
┌─────────────────────────────────────────────────────────────────┐
│  [S] Sổ AI  ● AI đang xử lý     [✨ Command bar — ⌘K]     T11/25│
├─────────────────────────────────────────────────────────────────┤
│  Chờ duyệt 47 │ AI hạch toán 132 ↑~4h │ Chính xác 98.4%         │
│                                  [✓ Duyệt tất cả tin cậy cao 32]│
├──────────────[ Inbox AI 47 │ Đã hạch toán │ Cần xem lại │ ... ]─┤
│ ┌─ LIST (60%) ──────────────┐  ┌─ AI LẬP LUẬN (40%) ──────────┐ │
│ │ ● Hoá đơn vào · TCT · 2'  │  │ ✨ AI lập luận                │ │
│ │   FPT Telecom    2,695,000│  │ Khoản tiền vào 55tr từ XYZ   │ │
│ │   HĐ 00128456             │  │ khớp HĐ 00125 ngày 28/10…    │ │
│ │   Nợ 642 / Nợ 133 / Có 331│  │                              │ │
│ │                           │  │ ┌─ Bút toán đề xuất ───────┐ │ │
│ │ ● Sao kê VCB · ↔ HĐ 00125 │  │ │ Nợ 112 — TG VCB  55,000k │ │ │
│ │   CTY XYZ chuyển khoản    │  │ │  Có 131 — Phải thu 55,0k │ │ │
│ │   +55,000,000             │  │ └──────────────────────────┘ │ │
│ │   "TT HD 125 thang 10"    │  │                              │ │
│ │                       ✓★  │  │ ✓Khớp HĐ  ✓Đối tác đã có   │ │
│ │ ─────────────────────────  │  │ ✓Pattern ×17  Tin cậy 99%   │ │
│ │ ● Email forward · 12'     │  │                              │ │
│ │   Grab for Business 1.28M │  │ [✓ Duyệt & ghi sổ] [Sửa][✕] │ │
│ │   ⚠ AI chưa rõ: 641 / 642?│  │                              │ │
│ │                           │  │ HỎI AI VỀ MỤC NÀY            │ │
│ │ ● Sao kê Techcom · -5M    │  │  • Tại sao TK 131?           │ │
│ │   Chuyển NGUYEN VAN A     │  │  • Tổng đã thu của XYZ?      │ │
│ │   ⛔ Cần chứng từ — đã    │  │  • Áp dụng quy tắc tương lai │ │
│ │      nhắn KT trưởng       │  │                              │ │
│ │ + 43 mục khác             │  │                              │ │
│ └───────────────────────────┘  └──────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

## 7 nguyên tắc "phá cách" được hiện thực hoá

| # | Nguyên tắc | Hiện thực trong UI |
|---|------------|-------------------|
| 1 | Inbox thay menu | `/inbox` thành stream hợp nhất; bỏ 5 lane cards. Sidebar AI mode chỉ còn: Sổ AI · Hạch toán · Tài liệu · Báo cáo · Cài đặt |
| 2 | Mỗi mục là đề xuất có lập luận | Card hiển thị `proposed_entry` (Nợ/Có/TK) inline + nguồn (TCT/VCB/email) + ngày |
| 3 | Chấm tin cậy 3 màu | Dot trái card: 🟢 ≥90 (duyệt loạt), 🟡 60–89 (cần chọn nhỏ), 🔴 <60 (đã nhắn KT trưởng) |
| 4 | Panel "AI lập luận" | Vùng phải: bút toán đề xuất + pill xác nhận từng tín hiệu + 3 nút (Duyệt & ghi sổ / Sửa / Bỏ qua) + ô "Hỏi AI về mục này" |
| 5 | Command bar ngôn ngữ tự nhiên | Header có `<input>` "Hỏi AI…" (⌘K) — submit → chuyển sang ChatDock với prefill, trả về câu trả lời + bảng + drill-down |
| 6 | Đối chiếu hai chiều | Card sao kê hiện badge `↔ Khớp HĐ 00125` khi `matched_invoice_id` ≠ null; click mở cả 2 mục cạnh nhau |
| 7 | "Áp dụng quy tắc cho tương lai" | Sau khi user sửa (vd Grab → 641), nút "Áp dụng cho tương lai" tạo row trong `inbox_rules`; mục giống sau đó tự lên 🟢 |

## Kiến trúc dữ liệu

### Phái sinh động (không đổi schema)
`inbox_items` là **view ảo** gộp 3 nguồn hiện có, phân loại + tính confidence trong server function:
- `documents` (OCR hoá đơn vào, có `ocr_extracted` JSON)
- `bank_transactions` (status='unmatched' hoặc có gợi ý khớp)
- `ai_insights` (anomaly, deadline)

Một item có hình dạng:
```ts
type InboxItem = {
  id: string;
  source: "tct_einvoice" | "email_forward" | "bank_statement" | "cash" | "ai_insight";
  source_label: string;          // "Hoá đơn vào · TCT · 2 phút trước"
  title: string;                  // "FPT Telecom"
  subtitle: string;               // "Cước Internet T11 · HĐ 00128456"
  amount: number;
  partner: string;
  occurred_at: string;
  confidence: number;             // 0..100
  confidence_band: "high" | "medium" | "low";
  proposed_entry: { lines: Array<{ dr?: string; cr?: string; account: string; amount: number; memo?: string }> };
  reasoning: {
    summary: string;              // "Khoản tiền vào 55tr từ XYZ khớp HĐ 00125 ngày 28/10…"
    signals: Array<{ kind: "match" | "partner" | "pattern" | "memo" | "warn"; label: string; ok: boolean }>;
  };
  match_ref?: { kind: "invoice"; id: string; ref: string };   // hai chiều
  blocker?: { reason: string; notified?: string };            // "Cần chứng từ — đã nhắn KT trưởng"
  followups: string[];            // 3 câu prompt gợi ý
};
```

Confidence được tính bằng heuristic trong server fn:
- +40 nếu khớp được 1 hoá đơn (cùng số tiền, đối tác có trong DB, memo chứa số HĐ)
- +30 nếu đối tác đã có trong sổ
- +20 nếu pattern (account_code, partner) lặp ≥ 5 lần trong 90 ngày qua
- +10 nếu OCR confidence ≥ 0.9
- Lookup `inbox_rules` khớp → cộng 25 + ép band lên "high"

### 2 bảng mới (cần migration nhỏ)

`inbox_rules` — bộ não học từ chỉnh tay của người dùng
- `id, tenant_id, user_id, pattern_kind` (partner|memo|amount_range|source), `pattern_value`, `apply_account`, `apply_dimension` (jsonb), `confidence_boost`, `created_at`, RLS theo tenant

`inbox_decisions` — log audit + dữ liệu huấn luyện
- `id, tenant_id, user_id, item_source, item_external_id, action` (approve|edit|skip|escalate), `original_entry` (jsonb), `final_entry` (jsonb), `decided_at`

Không động `documents`, `bank_transactions`, `ai_insights`, `invoices`. Khi duyệt → ghi `journal_entries` + `journal_lines` + cập nhật `documents.status` / `bank_transactions.status='matched'` qua các function đã có.

## Server functions (TanStack `createServerFn`)

`src/lib/inbox-ai.functions.ts`:
- `listInboxAi({ tab, search, cursor })` — trả `InboxItem[]` + counts (Inbox/Đã hạch toán/Cần xem lại/Tài liệu/Báo cáo)
- `getInboxItemReasoning({ id })` — chi tiết signals + suggested followups
- `approveInboxItem({ id, edited_entry? })` — ghi `journal_entries`, log `inbox_decisions`, update source status
- `bulkApproveHighConfidence({ ids? })` — chỉ duyệt items confidence_band="high"
- `skipInboxItem({ id, reason })`, `escalateInboxItem({ id, message })`
- `saveInboxRule({ from_item_id, pattern, apply_account, apply_dimension })` — "Áp dụng quy tắc cho tương lai"

`src/lib/ai/inbox-reason.server.ts` chứa logic confidence + matcher (đọc `invoices` để khớp hoá đơn ↔ sao kê).

Command bar dùng lại `askAccountingStream` đã có, chỉ thêm helper `runCommandFromInbox(question)` mở `ChatDock` với prefill + ghim ngữ cảnh `pageContext="inbox-ai"`.

## Các file thay đổi

**Mới**
- `src/routes/_app/inbox.tsx` (viết lại, không còn 5 lane cards)
- `src/components/ai-inbox/inbox-shell.tsx` — layout 2 cột + tabs + stats strip
- `src/components/ai-inbox/inbox-item-card.tsx` — card có dot màu, bút toán inline, match badge
- `src/components/ai-inbox/reasoning-panel.tsx` — panel phải: bút toán + pill signals + action bar + followups
- `src/components/ai-inbox/command-bar.tsx` — input ngôn ngữ tự nhiên (⌘K mở, Enter submit qua ChatDock)
- `src/components/ai-inbox/confidence-dot.tsx` — 🟢🟡🔴 + tooltip giải thích
- `src/components/ai-inbox/bulk-approve-bar.tsx` — sticky "Duyệt tất cả tin cậy cao (N)"
- `src/lib/inbox-ai.functions.ts`
- `src/lib/ai/inbox-reason.server.ts`

**Sửa**
- `src/components/app-sidebar.tsx` — khi ở AI mode rút gọn còn: Sổ AI · Hạch toán · Tài liệu · Báo cáo · Cài đặt
- `src/routes/_app/inbox_.$lane.tsx` — giữ để truy cập sâu (link "Mở bảng cũ") nhưng không còn là entry chính
- `src/lib/ai/system-prompt.ts` — thêm hướng dẫn AI hiểu ngữ cảnh `inbox-ai`

**Migration** (chạy trước khi code)
- `inbox_rules` + RLS theo `tenant_id` + index `(pattern_kind, pattern_value)`
- `inbox_decisions` + RLS theo `tenant_id` + index `(item_source, item_external_id)`

## Cảm xúc / Motion (giữ "phá cách")

- Card mới slide-in từ phải (như email đến), kèm pulse dot nhẹ ở dot màu.
- Nút "Duyệt & ghi sổ" có haptic-style spring khi click; dòng đó fade-out + đẩy item kế lên (no full reload).
- "Duyệt tất cả tin cậy cao" có progress bar đếm ngược mục được ghi sổ (3–5 mục/giây cảm giác).
- Bút toán đề xuất dùng font mono nhẹ, account code in **đậm chữ số** (642, 331…) — đọc nhanh như kế toán đọc sổ tay.
- Pill signals: ✓ xanh emerald, ⚠ amber, ⛔ rose — 3 màu duy nhất, không pastel lung tung.
- Empty state khi inbox = 0: "Hôm nay sổ sạch ✨ — 132 bút toán đã ghi tự động." (cảm giác "vô vi" thay vì "trống trải").

## Phạm vi & các thứ KHÔNG làm trong vòng này

- Không xây trang "Đã hạch toán" / "Cần xem lại" / "Báo cáo" — chỉ tab placeholders (giữ tab "Inbox AI" hoạt động đầy đủ).
- Không retrain AI thật — `inbox_rules` chỉ là rule deterministic; LLM vẫn dùng prompt cũ.
- Không bóc tách OCR mới; tận dụng `documents.ocr_extracted` sẵn có.
- Không thay sidebar khi không ở AI mode (Mode cổ điển giữ menu cũ).

## Thứ tự thực thi

1. Migration `inbox_rules` + `inbox_decisions` (cần user duyệt).
2. `inbox-ai.functions.ts` + `inbox-reason.server.ts` với confidence heuristic + matcher.
3. Layout shell + tabs + stats strip + command bar.
4. Card list + reasoning panel + confidence dot + match badge.
5. Bulk approve bar + animations + "Áp dụng quy tắc tương lai".
6. Thu gọn sidebar khi ở AI mode.
7. Smoke test: tải `/inbox`, kiểm tra render 1 item từ mỗi nguồn, duyệt 1 mục, tạo 1 rule.
