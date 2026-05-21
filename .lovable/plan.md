## Mục tiêu

Khi user kéo / đính kèm hoá đơn vào ChatDock, biến luồng trả lời của AI thành **3 message cards có cấu trúc** thay cho text + accordion JSON hiện tại, đúng theo mockup:

1. **Card tiến trình minh bạch** — 4 bước có ✓ + thời gian thực (OCR · Trích xuất · Khớp đối tác · Đối chiếu quy tắc).
2. **Card hoá đơn + bảng trích xuất** — thumbnail PDF/ảnh bên trái, bảng field bên phải, pill `✓ MST hợp lệ` cạnh số MST.
3. **Card bút toán đề xuất** — Nợ/Có monospace + chip "Quy tắc áp dụng · lần thứ N" (click → `/ai/memory`) + hàng pill xác nhận đa nguồn + callout TT 219 + 4 nút sắc thái khác nhau.
4. Sau khi **Duyệt & ghi sổ** → card collapse thành 1 dòng tóm tắt, AI gửi **chained next card** "Còn N mục — tiếp tục?" với 3 nút.

Giữ design tokens (`--gradient-ai`, `primary`, `muted`, `border`, `accent`). Không màu cứng. Toàn bộ là FE/wiring nhẹ — không đụng business logic duyệt (`approveAiAction` giữ nguyên).

## Phạm vi

- FE chat: components mới + render logic trong `MessageList`.
- Server: bổ sung **phases có timing** vào output của `parseDocument` event đã có (không đổi schema tool, không đổi DB).
- Thumbnail: lưu file vào Storage (đã có `ai_uploads` flow); trả `storage_path` để FE tạo signed URL.
- 1 server fn nhỏ mới: `getAiUploadThumbnail({uploadId})` trả signed URL.
- 1 server fn nhỏ mới: `learnRulePreference({action_id, kind})` ghi feedback vào `ai_memory` khi user bấm "Đây không phải marketing".

## Kiến trúc render

```text
Assistant message (có toolEvents)
├── parseDocument event  ──► <ParseProgressCard phases=[ocr,extract,partner,rules] />
├── parseDocument result ──► <InvoiceExtractCard thumbnailUrl extracted msgStatus="ok" />
└── proposeAction event  ──► <JournalProposalCard
                                lines=[{side,acct,name,amount}]
                                rule={label, hitCount, memoryId}
                                signals=[{kind,label,ok}]
                                callout="TT 219 …"
                                actionId=…
                              />
                              ── on Approve ──► collapse to <PostedSummaryRow/>
                                                + render <ChainedNextCard remaining=46/>
```

## Files

### Mới (FE)

- `src/components/chat/invoice/parse-progress-card.tsx` — 4 dòng ✓ + ms, animate khi đang chạy.
- `src/components/chat/invoice/invoice-extract-card.tsx` — flex 2 cột: thumbnail (signed URL từ `ai_uploads.storage_path`) + danh sách field; pill MST hợp lệ.
- `src/components/chat/invoice/journal-proposal-card.tsx` — header BÚT TOÁN, `JournalLines`, `AppliedRuleChip` (Link tới `/ai/memory?ruleId=…`), `ConfidenceChips`, `CalloutTT219`, `ActionRow` 4 nút.
- `src/components/chat/invoice/posted-summary-row.tsx` — 1 dòng "✓ Đã ghi sổ HĐ … → 641/133/331" có link mở chứng từ.
- `src/components/chat/invoice/chained-next-card.tsx` — "Còn N mục" + 3 nút.
- `src/components/chat/invoice/types.ts` — type chung (InvoicePhases, ExtractedInvoice, ProposalCardData).

### Sửa

- `src/lib/ai/parse-document.functions.ts` — `parseFileCore` trả thêm `phases: [{name:'ocr'|'extract'|'partner_match'|'rules_check', label, ms}]`, `thumbnail: {uploadId}`, `partnerMatch: {name, id}|null`, `vatIdValid: boolean|null`, `rules: {matchedCount, ruleId, ruleLabel, hitCount}`.
- `src/lib/chat.functions.ts` — khi yield `tool-result` cho `parseDocument`, lấy `phases/thumbnail/partnerMatch/vatIdValid/rules` từ `parseFileCore` (đang trả về nhưng bị `truncateOutput` cắt) — nâng cap lên 8000 cho `parseDocument`.
- `src/lib/ai/tools/propose-action.tool.ts` — `execute` trả thêm `card: { lines, rule, signals, callout? }` lấy từ handler. **Không đổi `inputSchema`.**
- `src/lib/ai/action-handlers.server.ts` — mỗi handler thêm `toCardData(parsed, ctx)` trả `{lines,rule,signals,callout}`. Fallback null nếu chưa map.
- `src/components/chat/message-list.tsx` — sau khi nhận toolEvents:
  - `parseDocument` (call) → render `<ParseProgressCard streaming />`.
  - `parseDocument` (result) → render `<InvoiceExtractCard />`.
  - `proposeAction` (result) → render `<JournalProposalCard />` (thay cho row accordion).
  - Vẫn render `ToolCalls` cho các tool khác (`runQuery`, `renderChart`).
- `src/components/chat/tool-calls.tsx` — bỏ render `parseDocument` & `proposeAction` (đã có card riêng), tránh trùng.

### Mới (BE — nhỏ)

- `src/lib/ai-uploads.functions.ts` — `getAiUploadThumbnail({uploadId})`: signed URL 1h từ bucket `invoices`.
- `src/lib/ai-memory.functions.ts` (sửa) — thêm `learnFromFeedback({actionId, signal})` ghi 1 row `ai_memory` kiểu `negative_pattern` để lần sau AI không chọn quy tắc đó cho doanh nghiệp này.

## Hành vi nút bấm

| Nút | Hành động |
|---|---|
| `✓ Duyệt & ghi sổ` | `approveAiAction({action_id})` → toast → card collapse thành `PostedSummaryRow` → AI tự gửi tin nhắn "Đã ghi sổ. Còn N mục…" (gọi `askAccountingStream` ngầm với prompt hệ thống `__chained_next__`, không hiện thoại user). |
| `Sửa tài khoản` | Mở `Sheet` (shadcn) chỉnh `lines` của `input`, submit → server fn `updateAiActionInput({action_id, patch})` → invalidate. |
| `Đây không phải marketing` | Gọi `learnFromFeedback` + `cancelAiAction` → toast "Đã học. Mở Trí nhớ AI để xem lại?" với link. |
| `Bỏ qua` | `cancelAiAction` → card đổi sang trạng thái `dismissed` mờ. |

## Chained workflow

Sau `Duyệt & ghi sổ`:
- FE gửi `chat:dock-send` event với content rỗng + `meta.chainedNext = true`.
- Server `askAccountingStream` thấy meta đặc biệt → trả ngay text "Còn N mục…" + tool-result fake kiểu `chainedNext` với `{remaining, nextHref}`.
- FE render `<ChainedNextCard remaining=N />` với 3 nút `Tiếp tục` (mở hoá đơn kế tiếp từ inbox), `Tạm dừng`, `Xem sổ vừa ghi` (link đến chứng từ vừa tạo).

## Wiring tóm tắt

```text
parseFileCore  ─► {parsed, phases, thumbnail, partnerMatch, vatIdValid, rules}
chat.functions ─► yield tool-result parseDocument {...full payload}
MessageList    ─► nhìn toolName, dispatch sang card riêng
JournalProposalCard ─► approveAiAction → onPosted → triggerChainedNext()
ChainedNextCard  ─► Tiếp tục → window.dispatchEvent('chat:open-next-inbox')
```

## Out of scope

- Bulk approve nhiều hoá đơn 1 click (sẽ làm sau khi card đơn ổn).
- OCR realtime trên trình duyệt — vẫn dùng pipeline server hiện tại, chỉ trình bày đẹp hơn.
- Tab Trí nhớ AI: chỉ thêm route param `?ruleId=` để highlight; UI tab giữ nguyên.

## Rủi ro / fallback

- Nếu handler chưa có `toCardData` (thiếu map TK Nợ/Có) → card hiển thị `summary` text + ẩn block bút toán, giữ các nút.
- Nếu `parseFileCore` không trả `phases` (lỗi LlamaParse) → `ParseProgressCard` hiện 1 dòng "Đang phân tích…" rồi sang thẳng card kết quả/lỗi.
- Thumbnail thiếu (file ảnh bị xoá hoặc Storage lỗi) → fallback icon PDF + tên file (giống bubble user attachment hiện tại).
