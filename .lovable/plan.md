## Mục tiêu

Mọi dialog tạo/sửa phiếu giao dịch trong hệ thống dùng chung 1 cặp nút ở footer:

- **Huỷ** — `variant="outline"`, đóng dialog không lưu.
- **Lưu và thoát** — primary, thực hiện **lưu phiếu + ghi sổ + đóng dialog** trong 1 click. Khi đang chạy: `"Đang lưu…"` + spinner, disable nút.

Không còn các biến thể "Thoát", "Hủy" (dấu hỏi), "Lưu", "Lưu & sinh bút toán", "Tạo hoá đơn", "Lưu và thoát + Ghi sổ tách rời".

## Phạm vi (5 file)

| File | Dialog | Hiện tại | Đổi thành |
|---|---|---|---|
| `src/routes/_app/purchases/vouchers.tsx` | Phiếu mua hàng | Thoát · Lưu | Huỷ · Lưu và thoát (chain post sau save) |
| `src/routes/_app/sales/vouchers.tsx` | Phiếu bán hàng | Huỷ · Lưu và thoát + dropdown Ghi sổ | Huỷ · Lưu và thoát (gộp save+post, bỏ dropdown Ghi sổ trong dialog) |
| `src/routes/_app/invoices/index.tsx` | Tạo hoá đơn thủ công | Huỷ · Tạo hoá đơn | Huỷ · Lưu và thoát |
| `src/routes/_app/bank.vouchers.tsx` | BankReceiptDialog + TransferDialog | Huỷ · Lưu & sinh bút toán | Huỷ · Lưu và thoát (×2) |
| `src/components/voucher-form.tsx` | Phiếu thu/chi tiền mặt (dùng ở `cash/`, `receipts/`) | Hủy · Lưu & sinh bút toán | Huỷ · Lưu và thoát |

## Chi tiết kỹ thuật

### 1. Hành vi "Lưu và thoát = ghi sổ luôn"

- **purchases/vouchers.tsx**: trong handler nút, sau khi `mut.mutateAsync()` thành công lấy `voucher.id` rồi gọi tiếp server fn ghi sổ (đã dùng cho nút "Ghi sổ" ở danh sách); chỉ đóng dialog khi cả 2 OK. Nếu post fail → toast lỗi nhưng vẫn đóng (phiếu đã lưu draft).
- **sales/vouchers.tsx**: gộp `onSave` + `onPostNew` thành 1 handler `onSaveAndPost`; xoá `DropdownMenu` "Ghi sổ" khỏi footer dialog.
- **invoices/index.tsx** (manual): hoá đơn thủ công vốn đã ghi sổ ngay khi tạo — chỉ đổi label.
- **bank.vouchers.tsx** + **voucher-form.tsx**: các phiếu này vốn đã "sinh bút toán" ngay khi lưu — chỉ đổi label, không đổi logic.

### 2. Markup chuẩn (copy nguyên xi vào mỗi DialogFooter)

```tsx
<Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
  Huỷ
</Button>
<Button onClick={handleSaveAndPost} disabled={saving || !canSave}>
  {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
  {saving ? "Đang lưu…" : "Lưu và thoát"}
</Button>
```

Giữ nguyên các class responsive (`w-full sm:w-auto`, sticky footer ở mobile) đã có sẵn ở từng file.

### 3. Không động vào

- Nút "Ghi sổ" / "Bỏ ghi sổ" ở trang danh sách (ngoài dialog) — giữ nguyên cho phiếu đã lưu trước đó.
- Các dialog xem chi tiết (`voucher-detail-dialog.tsx`), import XML, link e-invoice — không thuộc luồng tạo/sửa phiếu.

## Kiểm thử nhanh sau khi sửa

- Tạo 1 phiếu mua, 1 phiếu bán, 1 phiếu thu, 1 phiếu chi NH, 1 chuyển khoản NH, 1 hoá đơn thủ công → mỗi cái chỉ 1 nút "Lưu và thoát" → kiểm tra phiếu xuất hiện ở danh sách với trạng thái **đã ghi sổ**.
- Nhấn "Huỷ" trên mỗi dialog → đóng, không tạo bản ghi.
