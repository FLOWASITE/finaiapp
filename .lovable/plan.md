## Bổ sung trạng thái xử lý lên card Inbox

### Mục tiêu
Hiển thị badge trạng thái xử lý ở **góc trên phải, cạnh số tiền** trên mỗi card Inbox, bao phủ toàn bộ vòng đời: OCR → Review → Approve/Skip.

### Mô hình trạng thái (mới, dẫn xuất ở server)
Thêm field `processing_status` vào `InboxItem`:

| Status | Khi nào | Màu | Nhãn |
|---|---|---|---|
| `ocr_pending` | document có `ocr_status` ∈ {pending, processing} | amber (pulse) | "Đang đọc OCR" |
| `ocr_failed` | document `ocr_status = 'failed'` | rose | "Lỗi OCR" |
| `blocked` | có `blocker` | rose | "Bị chặn" |
| `needs_review` | confidence < 60 (low) hoặc có warn signal | amber | "Cần xem lại" |
| `ready` | confidence ≥ 60, không blocker | emerald | "Sẵn sàng duyệt" |
| `auto_ready` | confidence ≥ 88 (high) | indigo | "AI gợi ý duyệt" |
| `posted` | tab "Đã hạch toán" (item đã approve) | slate | "Đã hạch toán" |
| `skipped` | item bị skip | muted | "Đã bỏ qua" |

Bank/cash/insight items có default `ready`/`auto_ready` theo confidence (không có OCR).

### Thay đổi code

**1. `src/lib/ai/inbox-types.ts`**
- Thêm `ProcessingStatus` union + field `processing_status: ProcessingStatus` (optional) vào `InboxItem`.

**2. `src/lib/ai/inbox-reason.server.ts`**
- `buildDocumentItem`: tính `processing_status` từ `doc.ocr_status` + `blocker` + `confidence_band`. Khi `ocr_status ∈ {pending, processing}` → return item dạng stub với `processing_status = 'ocr_pending'`, không cần proposal/reasoning đầy đủ (hoặc giữ proposal nhưng đánh dấu).
- `buildBankItem`, `buildInsightItem`: set `processing_status` theo confidence/blocker.

**3. `src/components/inbox/item-card.tsx` (ItemCard trong `src/routes/_app/inbox.tsx` lines 819-1000)**
- Thêm component nhỏ `StatusBadge` (icon + nhãn ngắn, dùng Tailwind tokens).
- Render ở **góc trên phải, ngay phía trên/cạnh số tiền** (cùng cột với amount). Layout hiện tại của khối phải: số tiền + đơn vị "đ"; thêm badge phía trên amount, căn phải, `mb-1`.
- Icon map: `Loader2 animate-spin` cho `ocr_pending`, `AlertTriangle` cho `ocr_failed`/`blocked`, `Eye` cho `needs_review`, `CheckCircle2` cho `ready`, `Sparkles` cho `auto_ready`, `Archive` cho `posted`, `MinusCircle` cho `skipped`.

**4. Skeleton variant cho `ocr_pending`**
- Trong ItemCard: nếu `processing_status === 'ocr_pending'`, ẩn block pills "Nợ/Có" và thay bằng dòng `Skeleton` (3 placeholder bars) + badge đếm thời gian xử lý. Giữ supplier, amount, badge.

### Không thay đổi
- Engine định khoản, DB schema, server functions khác.
- Logic approve/skip/bulk.
- Confidence rail trái (giữ nguyên theo design "Premium fintech").

### Phạm vi
3 file: `inbox-types.ts`, `inbox-reason.server.ts`, `routes/_app/inbox.tsx` (ItemCard).
