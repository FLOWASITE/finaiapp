## Vấn đề
Sau khi huỷ ghi sổ, menu vẫn hiển thị "Ghi sổ" thay vì "Ghi sổ lại".

Nguyên nhân: trong `voidSalesVoucher` (line 985) và `voidPurchaseVoucher` (line 746), khi reset trạng thái phiếu về `draft`/`reviewed`, code đang set `posted_at = null`. Trong khi UI dùng chính `r.posted_at` để phân biệt "đã từng ghi sổ" → hiển thị "Ghi sổ lại".

## Sửa

**`src/lib/sales-vouchers.functions.ts`** (~line 985)
- Bỏ dòng `posted_at: null` trong update của `voidSalesVoucher`. Giữ `posted_at` lại như dấu vết "đã từng ghi sổ". Khi user bấm "Ghi sổ lại", `postSalesVoucher` sẽ overwrite `posted_at` bằng timestamp mới.

**`src/lib/purchase-vouchers.functions.ts`** (~line 746)
- Bỏ dòng `posted_at: null` trong update của `voidPurchaseVoucher`, cùng lý do.

Không thay đổi UI hay logic khác. Báo cáo/sổ sách không bị ảnh hưởng vì `posted_at` chỉ là metadata; điều kiện lọc "đã ghi sổ" trong toàn bộ codebase đều dùng `status = 'posted'`, không dùng `posted_at`.

## Kiểm chứng nhanh sau khi áp dụng
1. Mở 1 phiếu đã ghi sổ → Huỷ ghi sổ → menu phải hiển thị "Ghi sổ lại".
2. Bấm "Ghi sổ lại" → phiếu quay về `posted` bình thường, có bút toán mới.
