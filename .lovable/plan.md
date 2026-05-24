## Gắn `items` vào engine định khoản (đường fallback document)

### Bối cảnh
- Khi document **đã liên kết với invoice** (`doc.invoice_id`), engine `proposeJournalForInvoice` đã chạy step phân loại từng dòng (`classifyLines` → `composeEntries`) dựa vào bảng `invoice_lines` — nên đã có Nợ chi tiết theo từng dòng. Không cần đổi gì cho nhánh này.
- Khi document **chưa link invoice** (đa số phiếu mua OCR mới), nhánh fallback trong `src/lib/ai/inbox-reason.server.ts` hiện chỉ tạo **1 dòng Nợ** dùng `expense_account` mặc định (`642`), bỏ qua `items[]` đã parse được — đó là lý do user thấy "Nợ 642 / Nợ 133 / Có 331" gộp.

### Phạm vi
Sửa **1 file**: `src/lib/ai/inbox-reason.server.ts`, hàm `buildDocumentItem`, đoạn fallback sau khối `if (doc.invoice_id) { ... }` (≈ dòng 215–250). Không đụng engine, DB, types, UI.

### Logic mới (fallback path)
1. Nếu `items.length > 0`:
   - Với mỗi item, gọi `classifyLine({ description: item.name, qty, unit_price, amount }, {})` để lấy `{ kind, account }`.
   - Gom nhóm theo `account`: cộng dồn `amount`, ghép `memo` (tên 2–3 mục đầu, kèm `+N` nếu nhiều).
   - Tạo 1 dòng `Nợ <account>` cho mỗi nhóm.
2. Nếu `vat > 0`: thêm `Nợ 133` (giữ nguyên).
3. Thêm `Có 331` cho tổng `amount` (giữ nguyên).
4. Vẫn cân bằng (sum debit = sum credit = total). Sửa rounding bằng cách cộng/trừ vào dòng debit cuối nếu lệch.

### Confidence & signals
- Nếu phân loại được items: `confidence += 10`, push signal `{ kind: "pattern", label: "Phân loại N dòng chi tiết (M loại TK)", ok: true }`.
- Cập nhật `reasoning.summary` để mô tả số lượng tài khoản chi phí thay vì chỉ tên 1 TK.

### Followups & UI
- Followup `"Tại sao TK X mà không phải khác?"` đổi sang dùng TK đầu tiên trong danh sách (lấy account đầu của group lớn nhất).
- UI list card và sheet "Đề xuất của Fin" đã render `proposal.lines[]` dạng pill nên tự hiển thị các dòng Nợ mới — không cần đổi UI.

### Không thay đổi
- Engine `proposeJournalForInvoice` và mọi bảng DB.
- Nhánh document có `invoice_id` (đã đi engine).
- Bank/cash/insight items.
- Types `Proposal` / `ProposalLine`.
