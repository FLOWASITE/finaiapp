## Mục tiêu

Cho KTT thấy ngay trong Inbox: (1) trạng thái "Auto-duyệt đang BẬT" + ngưỡng, (2) danh sách bút toán Fin đã tự duyệt 7 ngày qua để audit nhanh và rút phép nếu nghi ngờ.

## Phạm vi

Chỉ frontend + 1 server function read-only mới. Không sửa engine auto-post, không đổi schema.

## Thay đổi

### 1. Server function mới `getAutoPostedRecent` — `src/lib/categorize.functions.ts`

- Input: `{ days?: number = 7, limit?: number = 50 }`
- Query `ai_journal_proposals` của tenant hiện tại:
  - `status = 'auto_posted'`
  - `resolved_at >= now() - days`
  - join nhẹ sang `invoices`/`sales_invoices` qua `invoice_id` để lấy `supplier_name`/`customer_name`, `invoice_no`, `total`, `issue_date`
- Trả về: `{ items: [{ id, kind, party_name, invoice_no, issue_date, total, confidence, journal_entry_id, resolved_at }], count_7d, sum_amount_7d }`
- Dùng `withTenant` middleware như các fn khác trong file.

### 2. Badge "Auto-duyệt: BẬT/TẮT" trong header Inbox — `src/routes/_app/inbox.tsx`

- Đọc `getAutoPostSettings` (đã có) bằng `useQuery`.
- Thêm `<AutoPostBadge />` vào `InboxHeader` (dòng ~908), bên cạnh `TenantSwitcher`.
- BẬT: badge emerald, icon `Zap`, text `Auto-duyệt · ≥{conf}% · ≤{amount đ}`.
- TẮT: badge muted, text `Auto-duyệt: Tắt`.
- Click badge → mở `AutoPostAuditSheet` (mục 3).
- Link nhỏ "Cài đặt" → `/ai/memory` (đã có AutoPostCard).

### 3. Sheet "Đã tự duyệt 7 ngày qua" — `src/components/inbox/auto-post-audit-sheet.tsx` (mới)

- `Sheet` (shadcn) mở từ phải, width ~520px.
- Header: tiêu đề + 2 stat card: "Đã tự duyệt 7 ngày" (count) và "Tổng giá trị" (sum_amount_7d).
- Cảnh báo plain text (theo quy tắc lõi): _"Fin chỉ tự duyệt khi độ tin cậy cao + giá trị nhỏ + NCC đã định danh. Bạn có thể rút phép bất cứ lúc nào."_
- Danh sách item (`getAutoPostedRecent`):
  - Dòng: ngày, NCC/KH, số HĐ, số tiền (VND), badge confidence
  - Nút "Xem chứng từ" → link sang `/journal?entry={journal_entry_id}` hoặc `/invoices/$id`
  - Nút "Báo sai" (chỉ wire click + toast "Đã ghi nhận, Fin sẽ học lại" — KHÔNG đảo bút toán; rollback nằm ngoài phạm vi).
- Empty state: "Chưa có bút toán nào được Fin tự duyệt trong 7 ngày."
- Footer: link "Tắt auto-duyệt" → `/ai/memory` (không tự toggle để tránh thao tác nhầm).

### 4. Stats strip Inbox — thêm 1 ô

Trong `Stats` (dòng ~582), thêm `<Stat label="Fin tự duyệt 7 ngày" value={count_7d}>` (chỉ hiển thị khi enabled). Click → mở sheet.

## Không làm trong phạm vi này

- Không sửa engine.server.ts (logic auto-post đã có).
- Không thêm rollback / đảo bút toán.
- Không gửi notification Zalo / digest hằng ngày (có thể thêm sau).
- Không đổi schema DB.

## Kiểm thử

- Bật auto-post + tạo proposal có total nhỏ → confirm xuất hiện trong sheet.
- Tắt auto-post → badge chuyển TẮT, ô stat ẩn.
- Tenant chưa có proposal nào → empty state đúng.
