
# Xử lý khi user gửi nhiều file cùng lúc

Mục tiêu: thay vì 27 lượt parse rời rạc (mỗi file = 1 `parseDocument` card), chat hiển thị **1 message user duy nhất** + **3 message AI** (phân loại → kế hoạch → câu hỏi ngay) + **1 status card live** khi chạy → tóm tắt cuối → chained task.

## Đổi gì so với hiện tại

Hôm nay (`composer.tsx` + `chat.functions.ts`):
- User chip lên N file rời, gửi đi → `attachments[]`.
- Server lặp `parseFileCore` từng file, **mỗi file yield 1 cặp tool-call/result** → message-list render N `ParseProgressCard` + N `InvoiceExtractCard` xen kẽ.
- Không có dedupe, không có phân loại tổng, không có "ba xô", không có gating "Chạy kế hoạch".

Sau khi sửa:
- Bubble user: nếu ≥ 6 file → grid 9 ô + `+N` (đã có `AttachmentChips` nhưng list-flat, sẽ thay bằng grid + collapse).
- Server thêm 2 step **trước** khi parse từng cái: **dedupe theo file_hash** + **classify nhanh theo filename/mime/size** → yield **1 tool event tổng** `bulkIntake` (không yield 27 cái lẻ).
- Vẫn parse từng file ở background nhưng **gộp progress** vào 1 card duy nhất (`BulkPlanCard`), không spam.
- AI text chia 3 đoạn rõ ràng (prompt hướng dẫn).
- Card kế hoạch có 3 xô (auto / review / ask), nút **Chạy kế hoạch** (gated — không tự chạy bulk), nút **Tinh chỉnh phân nhóm**, nút **Xem từng file**.
- Khi `Chạy` → status card live cập nhật `done/total`, có `Tạm dừng`, kết thúc → summary + chained next.

## Files mới (FE)

`src/components/chat/bulk/`:
- `types.ts` — `BulkIntake`, `BulkBucket = "auto" | "review" | "ask"`, `BulkItem { id, filename, kind, bucket, confidence, dupOf?, ocrCandidates?, reason }`, `BulkPlan { buckets: Record<BulkBucket, BulkItem[]>, duplicates: {filename, reason}[], etaSec }`.
- `bulk-grid-chips.tsx` — render attachment chips dạng grid 5×2 + `+N nữa`, click mở dialog xem hết. Dùng cho **bubble user**.
- `bulk-intake-card.tsx` — bảng 5 hàng (HĐ vào / HĐ ra / Sao kê / Ảnh HĐ giấy / Excel) với `count + status` (✓ đọc rõ / ⚠ OCR khó / ✓ đã parse). Khối "X file trùng đã bỏ qua" với link xem file gốc.
- `bulk-plan-card.tsx` — 3 panel (xanh / cam / đỏ), số lớn góc phải, danh sách ngắn từng item bên trong (truncate). Nút `Chạy kế hoạch` (`primary`), `Tinh chỉnh phân nhóm` (mở `bulk-refine-sheet`), `Xem từng file`. ETA `~N phút`.
- `bulk-refine-sheet.tsx` — sheet/right-drawer: list mọi item, mỗi item có select bucket (auto/review/ask) + override kind.
- `bulk-run-status-card.tsx` — sticky card khi đang chạy: progress `14/18`, list 4 mục gần nhất với ✓/◌, ETA còn lại, `Tạm dừng`, `Xem chi tiết`. Subscribe stream events.
- `bulk-summary-card.tsx` — tóm tắt cuối + chained next CTA (`Có, hạch toán luôn` / `Tôi xem trước`).
- `ocr-disambiguation-card.tsx` — thumbnail (xoay nhẹ `rotate-[-2deg]`) + 2-3 candidate với % giống + 3 nút: `Là X`, `Là Y (tạo mới)`, `Để tôi xem ảnh gốc`, `Bỏ file này`.

## FE wiring

`src/components/chat/composer.tsx`:
- Khi `pending.length >= 6` hiển thị grid 5×2 + `+N` thay cho flex-wrap dài.
- Không đổi luồng `onAttach` (vẫn gửi `AttachmentPayload[]` lên server như cũ).

`src/components/chat/message-list.tsx` (`InvoiceToolEvents`):
- Thêm 3 nhánh mới: `bulkIntake` → `BulkIntakeCard` + `BulkPlanCard` (gộp); `bulkRun` → `BulkRunStatusCard`; `bulkSummary` → `BulkSummaryCard`; `ocrDisambiguate` → `OcrDisambiguationCard`.
- Khi 1 message có `bulkIntake`, **ẩn toàn bộ** `parseDocument` events lẻ trong cùng message (đã được cuộn vào trong `BulkPlanCard`).
- `AttachmentChips` ở user bubble: nếu items > 5 → render `BulkGridChips` thay vì list dài.

`src/routes/_app/chat.$threadId.tsx`:
- Lắng nghe custom event `chat:run-bulk-plan` (từ `BulkPlanCard`) → gọi `askFn` với prompt nội bộ `__bulk_run__` + `bulkPlanId` để server biết thực thi danh sách đã duyệt.
- Lắng nghe `chat:bulk-pause` → `abortRef.current?.abort()` (đã có sẵn từ Stop logic).
- Lắng nghe `chat:bulk-chain-next` (từ `BulkSummaryCard`) → gửi prompt `__bulk_chain__:<fileId>`.

## Server changes

`src/lib/chat.functions.ts` (`askAccountingStream`):

1. **Nếu `attachments.length >= 3`**, chạy `bulkIntake` thay vì loop parse cũ:
   ```text
   - Tính file_hash (sha256 base64) cho từng file (đã có hash trong parseFileCore — tách thành helper hashOnly()).
   - Query ai_uploads.file_hash IN (...) cho user/tenant → mark dup, kèm filename gốc.
   - Phân loại nhanh theo (mime, filename regex): pdf+"HD"/"INV" → purchase_invoice/sales_invoice; csv|xlsx+"sao_ke"/"vcb"/"tcb" → bank_statement; image → invoice_image; xlsx khác → excel_unknown.
   - Build BulkPlan: confidence cao + có rule trùng → bucket "auto"; OCR ảnh hoặc thiếu match → "review"; ảnh mờ không đọc được tên / file lạ → "ask".
   - Yield 1 event:
       tool-call { toolName: "bulkIntake", input: { fileCount, dedupedCount } }
       tool-result { output: BulkPlan }
   - KHÔNG yield parseDocument lẻ.
   ```

2. Sửa system-prompt nhánh bulk: AI phải xuất **đúng 3 đoạn**:
   - Đoạn 1: 1 câu xác nhận ("Nhận đủ N files. Đang phân loại…") + nhắc card phía trên.
   - Đoạn 2: "Đây là kế hoạch của tôi cho M mục — sếp duyệt thì tôi chạy:" (card kế hoạch hiện ở dưới).
   - Đoạn 3: hỏi NGAY mục `ask` đầu tiên nếu có (OCR/ambiguous filename). Nếu rỗng → bỏ đoạn 3.

3. Thêm prompt `__bulk_run__` (frontend-injected user msg, ẩn khỏi UI):
   - Server phát hiện prefix → bỏ qua LLM, tự loop parse + auto-post các mục `auto` (gọi handler tương ứng giống `approveAiAction`), yield progress qua tool event `bulkRun` (stream nhiều `tool-result` cập nhật `{done, total, recentNames}`), kết thúc yield `bulkSummary` (counts + chained_next gợi ý từ items `excel_unknown`).
   - Mục `review` → tạo `ai_actions` row pending; mục `ask` → không làm gì (đã hỏi ở turn trước).

4. Helper mới: `src/lib/ai/bulk-intake.server.ts` — `buildBulkPlan({files, supabase, tenantId})`. Tách logic dedupe + classify quick.

`src/lib/ai/parse-document.functions.ts`: export `hashOnly(base64)` để tính sha256 nhanh không cần parse.

`src/lib/ai/action-handlers.server.ts`: không đổi shape, nhưng đảm bảo `createPurchaseInvoice` callable từ bulk runner (tách thành `runHandler(name, input, ctx)` tái sử dụng).

## OCR disambiguation

Khi `parseFileCore` cho `invoice_image` trả về `parsed.vendor_name` confidence < 70% và có >1 candidate trong `parties` table:
- Server yield `ocrDisambiguate` event với `{uploadId, candidates: [{partyId, name, similarity}]}`.
- FE render `OcrDisambiguationCard`. 3 nút: chọn party → POST `chat:ocr-resolve` → server lưu vào `ai_uploads.meta` và bucket item chuyển từ `ask` → `auto`/`review`. Nút "xem ảnh gốc" mở signed URL trong tab mới. "Bỏ file này" → mark skip.

## Status card streaming

Trong nhánh `__bulk_run__`:
```text
yield tool-call bulkRun { total }
for each item:
  process → yield tool-result bulkRun { done, total, lastName, lastStatus, etaSec }
end:
  yield tool-result bulkSummary { posted, review, ask, chainedFile?: {uploadId, kind, summary} }
```
FE chỉ render **1 card cuối cùng** cho `bulkRun` (key theo toolCallId), update tại chỗ — KHÔNG đẩy thêm card cho mỗi tick. Pause = abort signal (đã có).

## Out of scope

- Không thay đổi logic single-file (< 3 attachments giữ nguyên flow hiện tại).
- Không build bảng lương parser cho Excel (chỉ phân loại + chained CTA).
- Không animation thumbnail xoay phức tạp — chỉ `rotate-[-2deg] shadow-md`.
- Không lưu `BulkPlan` vào DB; sống trong `ai_actions.input` của 1 row tạm để run bulk reproduce được khi reload.

## Rủi ro

- AI text 3 đoạn không nhất quán: mitigate bằng prompt + few-shot trong `system-prompt.ts`.
- Stream nhiều tick `bulkRun` có thể spam re-render: dùng `useDeferredValue` + throttle trong `BulkRunStatusCard`.
- Dedupe sai (collision rare): luôn hiển thị "X file trùng — xem lại" với link, user có thể `Vẫn import`.

## Diagram

```text
User: [27 files chip grid] "Hạch toán hết..."
AI msg #1: "Nhận đủ 27 files. Đang phân loại..."
  └─ [BulkIntakeCard]   (5 hàng phân loại + 2 file trùng)
AI msg #2: "Đây là kế hoạch..."
  └─ [BulkPlanCard]     (3 xô + nút Chạy kế hoạch)
AI msg #3: "Trước khi chạy, sếp giúp file 23..."
  └─ [OcrDisambiguationCard]

(user click Chạy)
AI msg #4 (streaming live):
  └─ [BulkRunStatusCard]  done 14/18 → 18/18
AI msg #5:
  └─ [BulkSummaryCard]    + chained next CTA
```
