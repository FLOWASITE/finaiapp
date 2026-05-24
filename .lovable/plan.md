## Tích hợp Agent Hạch toán vào Trung tâm tài liệu

Mục tiêu: từ trang `/documents`, kế toán nhìn thấy ngay trạng thái bút toán của mỗi tài liệu, mở chi tiết là xem/sửa/duyệt được đề xuất mà không cần nhảy qua `/categorize`.

### 1. Hiển thị trạng thái hạch toán trên danh sách

Trong `getDocument` / `listDocuments` (file `src/lib/documents.functions.ts`), bổ sung 1 join nhẹ sang `ai_journal_proposals` (lấy `status`, `confidence`, `source` mới nhất theo `invoice_id`).

Trên bảng tài liệu (`/documents/index.tsx`):

- Thêm cột "Hạch toán" với badge:
  - `Đã ghi sổ` (xanh) — proposal `approved` hoặc invoice đã có journal_entry.
  - `Chờ duyệt` (vàng) + % confidence — proposal `pending`.
  - `Cần xem` (xám) — `skipped` / có warning.
  - `—` — tài liệu không phải hoá đơn / chưa có invoice_id.
- Click badge → mở Sheet và switch sang tab `Hạch toán` (xem mục 2).

### 2. Tab "Hạch toán" trong Sheet chi tiết tài liệu

Trong Sheet detail (`DocumentSheet`), thêm 1 TabsTrigger thứ 4 là **Hạch toán** (chỉ hiện khi `doc.invoice_id`).

Nội dung tab:

- Reuse `ProposalCard` từ `src/components/categorize/ProposalCard.tsx` (đã có inline edit, warnings, approve/skip).
- Trên cùng có nút **Hạch toán lại** (gọi `proposeJournal({ invoice_id, force: true })`) cho trường hợp cần refresh.
- Nếu chưa có proposal → state trống + nút **Tạo đề xuất bút toán** (gọi `proposeJournal({ invoice_id })`).
- Nếu đã `approved` → hiển thị tóm tắt bút toán + link "Xem trong sổ nhật ký".

Lợi ích: kế toán không cần rời khỏi tài liệu để hạch toán; đồng nhất engine với trang `/categorize`.

### 3. Bộ lọc & batch action

Trong header `/documents`, thêm filter `categorize_status`: `all | pending | approved | skipped | none`.

Khi chọn nhiều dòng `pending`, hiện thanh action **Duyệt hàng loạt** (gọi cùng API `approveProposal` mà `/categorize` đang dùng).

### 4. Tự động khi upload mới (đã có sẵn engine)

Pipeline `parse-document` đã gọi `autoPostIfEligible` sau khi tạo invoice. Bổ sung:

- Sau khi parse xong, invalidate query `["documents", ...]` để bảng Trung tâm tài liệu cập nhật badge "Chờ duyệt" / "Đã ghi sổ" realtime.
- Trên toast "Đã đọc xong tài liệu", thêm dòng phụ: *"Engine đã tạo bút toán — chờ duyệt"* hoặc *"Đã ghi sổ tự động (conf 92%)"*.

### 5. Liên kết 2 chiều

- Tab "Liên kết" hiện tại đã list `entity_table` = `journal_entry` sau khi approve — chỉ cần thêm link tới `/journal/$id`.
- Trên trang `/categorize`, ProposalCard đã có nguồn `invoice` — thêm link nhỏ "Mở tài liệu gốc" mở Sheet ở `/documents?id=...`.

### File thay đổi

- `src/lib/documents.functions.ts` — join `ai_journal_proposals` vào `listDocuments`/`getDocument`.
- `src/routes/_app/documents/index.tsx` — thêm cột badge, tab Hạch toán, filter, batch action.
- `src/components/categorize/ProposalCard.tsx` — nhận thêm prop `compact` để render gọn trong Sheet (không trùng header).
- `src/lib/categorize.functions.ts` — thêm `proposeJournal` chấp nhận flag `force` (skip cache).

### Acceptance

1. Upload 1 hoá đơn Dell 45tr → bảng tài liệu hiện badge `Đã ghi sổ` (auto-post).
2. Upload hoá đơn 50tr tiền mặt → badge `Chờ duyệt 70%` + warning trong tab Hạch toán.
3. Mở Sheet → tab Hạch toán hiển thị Nợ/Có, ấn **Duyệt & ghi sổ** → badge đổi sang `Đã ghi sổ`, tab Liên kết xuất hiện `journal_entry`.
4. Filter `categorize_status=pending` → chỉ còn các tài liệu chờ duyệt; batch select 5 dòng → duyệt 1 phát.
