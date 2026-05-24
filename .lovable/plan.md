## Vấn đề

UI gợi ý của Fin (sheet `inbox-item-sheet.tsx`) không hiển thị danh sách hàng hoá / dịch vụ, mặc dù OCR của tài liệu đã trích xuất đầy đủ (`items[]` trong `ocr_extracted`).

Đồng thời, khi rà DB thực tế thấy `buildDocumentItem` đang đọc sai tên trường: OCR lưu `seller_legal_name`, `seller_tax_code`, `invoice_number`, `total_amount`, `net_amount`, `items[]` — nhưng code đang đọc `supplier_name`, `vendor_name`, `total`, `subtotal`, không có nhánh nào đọc `items`. Đây cũng là lý do nhiều phiếu vẫn rơi vào "Chưa xác định tên" / không có meta dù OCR đã parse xong.

## Phạm vi

Chỉ FE / glue: bổ sung field, thêm UI block. Không động vào DB, RLS, engine hạch toán.

## Thay đổi

**1. `src/lib/ai/inbox-types.ts`** — mở rộng `Proposal`:
```ts
items?: Array<{ name: string; qty?: number; unit_price?: number; amount: number }>;
```

**2. `src/lib/ai/inbox-reason.server.ts` — `buildDocumentItem`**

- Bổ sung alias đọc OCR (ưu tiên giá trị có sẵn, fallback dần):
  - `amount`     ← `ext.total_amount ?? ext.total ?? ext.amount`
  - `supplier`   ← `… ?? ext.seller_legal_name`
  - `supplierTaxId` ← `… ?? ext.seller_tax_code`
  - `invoiceNo`  ← `ext.invoice_number ?? ext.invoice_no ?? ext.number`
  - `subtotal`   ← `ext.net_amount ?? ext.subtotal ?? max(0, amount-vat)`
- Chuẩn hoá `invoice_date`: nếu match `dd/mm/yyyy` → đổi sang `yyyy-mm-dd`.
- Build `items` từ `ext.items ?? ext.lines ?? ext.line_items`:
  ```ts
  items = rawItems.map(r => ({
    name: r.item_name ?? r.name ?? r.description ?? "—",
    qty: Number(r.quantity ?? r.qty) || undefined,
    unit_price: Number(r.unit_price) || undefined,
    amount: Number(r.total_amount ?? r.amount ?? 0),
  }));
  ```
- Gắn `items` vào `proposal` ở cả hai nhánh: engine path (line 182–200) và fallback path (line 298–316).

**3. `src/components/inbox/inbox-item-sheet.tsx`**

Thêm block mới giữa `VoucherMetaGrid` (line 299) và "Trust strip" (line 304):

```text
┌─ Hàng hoá / dịch vụ ───────────────┐
│ 1. Phí kế toán Q4.2025  1×6.000.000  6.000.000đ │
│ 2. Phí kế toán Q1.2026  1×6.000.000  6.000.000đ │
└────────────────────────────────────┘
```

- Component `ProposalItemsList({ items })` — null nếu rỗng.
- Mỗi dòng: STT · tên (truncate) · `qty × unit_price` (nếu có) · amount (right-align, tabular-nums).
- Style đồng bộ với block "Bút toán đề xuất" (rounded-2xl, border, bg-muted/30, label uppercase tracking-widest).
- Không thêm nút bấm, không edit-in-place — chỉ hiển thị.

## Verify

Sau khi áp dụng, mở 1 inbox item có `documents.ocr_extracted.items` (vd UUID đã trích trong DB): phải thấy đủ NCC, MST, các trường meta, và block "Hàng hoá / dịch vụ" liệt kê 2 dòng dịch vụ kế toán.
