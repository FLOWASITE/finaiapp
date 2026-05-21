## Vấn đề

Trong dialog Phiếu mua hàng, nút **Lưu phiếu nháp** bị disable do điều kiện:

```ts
disabled={mut.isPending || !header.voucher_no || !header.reason}
```

Session replay cho thấy người dùng đã điền số phiếu (`PMH-202605-0001`), NCC, ngày, dòng hàng… nhưng **không gõ Diễn giải** (chỉ thấy placeholder), nên nút Lưu vẫn xám.

`voucher_no` đã tự sinh ⇒ thực tế chỉ `reason` chặn.

## Cách sửa (chỉ UI, file `src/routes/_app/purchases/vouchers.tsx`)

1. **Tự sinh diễn giải mặc định** khi user để trống, dựa vào supplier_name / invoice_no — đúng chuỗi đang hiển thị ở placeholder:
   ```
   Mua hàng từ nhà cung cấp {supplier_name|"---"} theo hoá đơn số {invoice_no|"---"}
   ```
   Tạo helper `defaultReason(header)` và dùng `header.reason?.trim() || defaultReason(header)` ở chỗ submit (`mut.mutationFn`, dòng ~485).

2. **Bỏ điều kiện `!header.reason`** ở nút Lưu (dòng 921). Giữ lại `!header.voucher_no` để chống lưu thiếu số phiếu.

3. Đổi label `Diễn giải *` → `Diễn giải` (không còn bắt buộc) và giữ placeholder để user biết giá trị mặc định sẽ được sinh ra.

## Out of scope

- Không thay đổi server function / schema / DB.
- Không sửa logic dòng hàng, picker, hay tab Hoá đơn.
- Không đụng các nút Post/Void/Delete.
