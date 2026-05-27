## Vấn đề

Phiếu mua hàng PM2026-00004 (hóa đơn 00001444 — JOY FOOD) **CÓ** lines trong DB, nhưng cột `product_name` và `product_code` đều **NULL**, chỉ có `description` được điền:

```
product_code | product_name | description
NULL         | NULL         | Khay bã mía... (T304-G)
NULL         | NULL         | Khay bã mía... (T002-G)
```

## Nguyên nhân

1. **Backfill migration sai trường** (`20260527022428_…sql`): Khi tôi tạo migration backfill cho JOY FOOD ở turn trước, lệnh `INSERT INTO purchase_voucher_lines` chỉ ghi vào cột `description`, **không** ghi `product_name` / `product_code`. Form Phiếu mua hàng hiển thị cột "Tên hàng" dựa trên `product_name` → trống.

2. **Số phiếu chạy thành PM2026-00004** (không phải PM2026-00001 như dự kiến) vì lúc backfill đã tồn tại PM2026-00001/02/03.

3. **Hệ quả phụ**: vì `product_name` rỗng nên điều kiện ở `vouchers.tsx:1245` `(l.product_name || l.product_code)` loại bỏ dòng → không cho phép gắn Phiếu nhập kho.

> Lưu ý: hàm `materializePurchaseVoucherFromDocument` trong `inbox-ai.functions.ts` (line 677) đã đúng — có fallback `l.item_name ?? l.name ?? l.product_name ?? l.description ?? "—"`. Vấn đề chỉ ở migration backfill thủ công.

## Cách sửa

Chạy một migration nhỏ **UPDATE** 2 dòng đã có sẵn, copy `description` sang `product_name` (và trích `product_code` từ pattern `(T304-G)` / `(T002-G)` trong description):

```sql
UPDATE purchase_voucher_lines
SET product_name = description,
    product_code = CASE
      WHEN description LIKE '%(T304-G)%' THEN 'T304-G'
      WHEN description LIKE '%(T002-G)%' THEN 'T002-G'
      ELSE NULL
    END
WHERE voucher_id = 'e4868905-2cbe-484e-9455-2a0f2e306382'
  AND product_name IS NULL;
```

Không cần đụng code — đường ghi sổ mới (qua Inbox AI sau fix turn trước) đã set `product_name` đúng. Đây là vá dữ liệu một lần cho riêng phiếu JOY FOOD.

## Kiểm tra sau khi xong

1. Mở `/purchases/vouchers` → chọn PM2026-00004 → thấy 2 mặt hàng "Khay bã mía…" hiển thị đầy đủ.
2. Có thể bấm "Gắn Phiếu nhập kho" cho phiếu này (điều kiện `product_name` đã thoả).
