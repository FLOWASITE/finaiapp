# Kế hoạch: Hóa đơn lớn hơn + Bút toán đề xuất + Nút xem lớn

## Mục tiêu
- Tờ hóa đơn (XML preview) chiếm nhiều không gian hơn, chữ to/dễ đọc hơn.
- Cột bên phải KHÔNG lặp lại field hoá đơn nữa — thay bằng panel **"Bút toán đề xuất"** (JournalProposalCard ghép vào trong card).
- Thêm nút **"Xem lớn"** mở dialog full-screen để xem hoá đơn ở kích thước lớn.

## Thay đổi cụ thể

### 1. `invoice-extract-card.tsx` — restructure layout
- Đổi grid XML từ `md:grid-cols-[340px_1fr]` → `md:grid-cols-[1.4fr_1fr]` (hoặc `[minmax(420px,1.5fr)_1fr]`) để tờ hoá đơn rộng hơn cột phải.
- **Bỏ** khối `<dl>` field grid bên phải khi là XML (`isXml && parsed?._einvoice`).
- Cột phải XML render component mới `<JournalProposalSlot uploadId={...} parsedRef={...} />`:
  - Nếu chưa có proposal → skeleton "AI đang lập bút toán đề xuất…" (3 dòng debit/credit shimmer).
  - Nếu có → render `JournalProposalCard` (compact variant, không border vì đã nằm trong card cha).
- Thêm nút **"Xem lớn"** (icon `Maximize2`) ở góc trên-phải của ô preview hoá đơn → mở `<Dialog>` chứa `XmlInvoicePreview` ở size `max-w-4xl` với padding/font tăng ~1.25×.

### 2. `xml-invoice-preview.tsx` — scale up
- Thêm prop `size?: "default" | "large"`.
  - `default`: như hiện tại nhưng tăng nhẹ (title `text-base`, body `text-sm`, padding `p-4`).
  - `large`: title `text-2xl`, body `text-base`, padding `p-6`, dùng trong dialog.
- Giữ nguyên thanh đỏ, badges, bảng zebra, footer CQT.

### 3. `message-list.tsx` — ghép parseDocument với proposeAction kế tiếp
- Trong vòng lặp render: khi gặp `parseDocument` có `parsed`, dòm tiếp các tool call sau trong cùng message:
  - Nếu tìm thấy `proposeAction` có `tool_name === "createPurchaseInvoice"` liên quan (cùng vendor/total hoặc đơn giản là cái proposeAction đầu tiên ngay sau) → truyền `proposal={ actionId, toolName, input, summary }` vào `InvoiceExtractCard`, và **đánh dấu bỏ qua** không render `JournalProposalCard` rời ở dưới.
  - Nếu chưa có (đang streaming) → vẫn render `InvoiceExtractCard` với slot rỗng (skeleton).
- Cách đánh dấu: build `Set<string>` các `proposeAction` id đã được consume; vòng lặp `proposeAction` skip nếu id nằm trong set.

### 4. Dialog "Xem lớn"
- Dùng shadcn `Dialog` đã có sẵn.
- Nội dung: `<XmlInvoicePreview data={...} signedUrl={...} size="large" />` + nút tải XML/PDF gốc + nút copy CQT.
- Trigger: nút icon `Maximize2` ở overlay góc trên-phải preview, hover hiện rõ.

### 5. Non-XML (PDF/ảnh)
- Giữ cấu trúc cũ (preview trái, fields phải) nhưng cũng thêm nút "Xem lớn" → dialog mở object PDF / ảnh full size.
- Cột phải vẫn có thể hiển thị bút toán đề xuất ở phần dưới sau fields (optional, scope phụ).

## File chạm
- `src/components/chat/invoice/invoice-extract-card.tsx` (restructure, thêm dialog, slot)
- `src/components/chat/invoice/xml-invoice-preview.tsx` (prop size)
- `src/components/chat/invoice/journal-proposal-card.tsx` (thêm prop `embedded?: boolean` để bỏ border ngoài khi nhúng)
- `src/components/chat/message-list.tsx` (ghép parseDocument ↔ proposeAction)

## Không thay đổi
- Logic AI / server function / schema parsed.
- Cách `proposeAction` tạo `ai_actions` row.

## Kết quả mong đợi
- Hoá đơn XML hiển thị to, rõ, không bị bóp 340px.
- Bên phải là bút toán đề xuất luôn — user thấy ngay hoá đơn + bút toán cạnh nhau, một màn hình duyệt được.
- Bấm "Xem lớn" để zoom hoá đơn khi cần kiểm tra chi tiết.
