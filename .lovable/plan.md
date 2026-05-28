## Vấn đề

Trong sheet "Đề xuất của Fin", phần **Khớp mặt hàng với mã hệ thống** hiển thị gợi ý kiểu `LOG-VAN-CHUY-NOI · 85%`. Khi bấm chọn, hệ thống lưu mapping `NCC → mã SP` (qua `confirmItemMapping`) và invalidate `inbox-ai`, nhưng **khối "BÚT TOÁN ĐỀ XUẤT" không đổi** vì:

1. `confirmItemMapping` chỉ ghi rule, không trả về `default_account` để FE đổi line ngay.
2. `workingItem` ở `inbox-item-sheet.tsx` là local state — sau khi refetch `inbox-ai`, lines mới không được đồng bộ trở lại.
3. Server-side `materializePurchaseVoucherFromDocument` đọc account từ rule mapping của SP, nhưng phải đợi refetch + reset state mới phản ánh.

Hệ quả: KTV thấy "bấm chẳng có gì xảy ra".

## Giải pháp

### 1. `confirmItemMapping` trả về account mặc định của SP đã chọn
File: `src/lib/inbox-resolution.functions.ts`
- Sau khi insert `supplier_product_rules`, `SELECT stock_account, item_type` từ `products` của `product_id` và include vào payload trả về (`{ ok: true, product: { id, code, name, stock_account, item_type } }`).

### 2. Optimistic swap trong `ItemResolutionPanel`
File: `src/components/inbox/item-resolution-panel.tsx`
- Thêm prop callback `onLineAccountResolved?(args: { itemIndex: number; rawName: string; account: string; productCode: string; productName: string })`.
- Trong `onSuccess` của `confirmMut` và `promoteMut`, nếu kết quả có `stock_account`, gọi callback với `account` mới + chỉ số dòng tương ứng (map qua `splits[idx]` / `it.name`).

### 3. Áp account mới vào `workingItem.proposal.lines` ngay
File: `src/components/inbox/inbox-item-sheet.tsx`
- `ItemResolutionPanelWrapper` nhận thêm prop `onLineAccountResolved`, forward xuống panel.
- Khi callback fire, update `workingItem`:
  - Tìm line "Nợ" có amount ≈ tổng amount của dòng SP (hoặc dòng đầu tiên có TK thuộc `PURCHASE_PURPOSE_SWAPPABLE_ACCOUNTS`).
  - Đổi `line.account` sang account mới.
  - Cập nhật `workingItem.missing.products[i]` (gỡ khỏi danh sách "cần tạo" → đánh dấu đã match).
- Toast: `Đã gắn mã LOG-VAN-CHUY-NOI · TK Nợ chuyển sang {account}`.

### 4. Đồng bộ lại workingItem khi `item` từ query đổi (an toàn cho lần refetch sau)
- Thêm `useEffect` so sánh `item.id` + `item.proposal.lines` hash — nếu khác `workingItem` và user chưa edit thủ công (track `dirty` flag), reset `workingItem` từ `item`.

### 5. Visual confirmation
- Khi line vừa bị đổi account, highlight ngắn (1.5s) bằng class `bg-emerald-500/10` để KTV thấy ngay thay đổi.

## File thay đổi

- `src/lib/inbox-resolution.functions.ts` — mở rộng payload `confirmItemMapping` (+ `promoteCatalogItem` nếu cần).
- `src/components/inbox/item-resolution-panel.tsx` — thêm callback, gọi sau khi confirm/promote.
- `src/components/inbox/inbox-item-sheet.tsx` — wire callback, swap account trong `workingItem`, thêm highlight + useEffect sync.

## Ngoài phạm vi

- Không đổi chip "Dịch vụ · 99%" thành interactive (theo lựa chọn của bạn — chỉ làm cho mã hệ thống).
- Không động vào server materialization logic — refetch sau đó sẽ hợp nhất tự nhiên.
- Không đổi schema database.
