# Làm gọn block "Thông tin phiếu"

## Vấn đề hiện tại
`VoucherMetaGrid` ở `src/components/inbox/inbox-item-sheet.tsx` (dòng 719–747) chiếm rất nhiều chiều cao:
- Padding `p-4` + header riêng 1 dòng + 2 cột chỉ hiện 4 field/lượt
- Mỗi field xếp dt/dd thành 2 dòng → 8 dòng dọc cho 5 field
- Label uppercase tracking-widest to gấp đôi giá trị

## Mục tiêu redesign
- Giữ đủ thông tin nhưng nén chiều cao ~50%
- Quét nhanh bằng mắt: label trái – giá trị phải, cùng baseline
- Nhấn các con số quan trọng (Tổng cộng) bằng typography, không bằng khoảng trắng

## Thiết kế mới (chỉ UI, không đổi data)

```
┌────────────────────────────────────────────────────────────┐
│ Thông tin phiếu                       HĐ 00002847 · 26/1  │  ← header dày, có summary
├────────────────────────────────────────────────────────────┤
│ NCC      CÔNG TY TNHH SX & TM TUYỀN…   MST  0302886602    │
│ Tiền hàng    4.836.000   Thuế GTGT  386.880               │
│ ───────────────────────────────────────────────────────── │
│                                  Tổng cộng   5.222.880 đ  │  ← nổi bật
└────────────────────────────────────────────────────────────┘
```

### Quy tắc layout
- Container: `rounded-xl border p-3` (giảm từ `rounded-2xl p-4`)
- Header 1 dòng `flex items-center justify-between`: tiêu đề trái + chip tóm tắt (số HĐ · ngày) bên phải → bỏ luôn 2 field invoice_no/invoice_date khỏi grid bên dưới
- Grid 12 cột thay vì 2 cột rộng:
  - NCC: `col-span-8`, MST: `col-span-4`
  - Tiền hàng: `col-span-6`, Thuế GTGT: `col-span-6`
  - Mỗi cell là 1 dòng inline: `<span class="text-[10px] uppercase text-muted-foreground mr-2">NCC</span><span class="text-xs font-medium">…</span>` (label + value cùng baseline, không xuống dòng)
  - NCC name: `truncate` với `title` tooltip đầy đủ
- Tổng cộng tách riêng dưới `<Separator/>`, căn phải, `text-base font-semibold tabular-nums` + đơn vị `đ` mờ
- Các field khác (payment_method, due_date, bank_*, memo…) vẫn render bằng cùng pattern inline trong grid 12 cột, mỗi field tối thiểu `col-span-6`, field dài (memo, supplier_name) `col-span-12`

### Field ưu tiên/ẩn
- Lên header (chip): `invoice_no`, `invoice_date`
- Ưu tiên hiện ở grid: `supplier_name|customer_name`, `*_tax_id`, `subtotal`, `vat_amount`
- Tổng cộng: dòng riêng, luôn cuối cùng
- Các field còn lại: render theo thứ tự `META_FIELD_LABELS`, vẫn dùng layout inline gọn

## Phạm vi
- Sửa duy nhất hàm `VoucherMetaGrid` trong `src/components/inbox/inbox-item-sheet.tsx`
- Không đổi props, không đổi `META_FIELD_LABELS`, không đổi logic `formatMetaValue`
- Không động vào `ProposalItemsList` hay phần khác

## Out of scope
- Block "Hàng hoá / dịch vụ" bên dưới
- ProposalCard ở trang /categorize
- Server functions, schema
