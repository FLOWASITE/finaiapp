## Mục tiêu

Đồng bộ cột "Thanh toán" giữa **Mua hàng** và **Bán hàng**, và kết nối 2 icon (Tiền mặt / Ngân hàng) tới đúng form tạo **Phiếu thu/chi tiền mặt** và **Phiếu thu/chi ngân hàng** (thay vì hiện toast hoặc mở dialog quick-pay rút gọn).

---

## 1. Mua hàng (`src/routes/_app/purchases/vouchers.tsx`)

- Đổi tiêu đề cột `TT thanh toán` → **`Thanh toán`** (dòng 661) cho khớp với Bán hàng.
- 2 icon ở cột này hiện chỉ hiện toast "đang phát triển" (dòng 734, 742). Sẽ wire để mở form thật:
  - Icon `CircleDollarSign` → mở **Phiếu chi tiền mặt** (`VoucherFormDialog` với `type="payment"`).
  - Icon `Landmark` → mở **Phiếu chi ngân hàng** (bank `VoucherDialog` với `type="payment"`).
- Prefill từ dòng phiếu mua: nhà cung cấp, số tiền còn phải trả, lý do "Thanh toán phiếu mua {voucher_no}".

## 2. Bán hàng (`src/routes/_app/sales/vouchers.tsx`)

- Hiện 2 icon đang gọi `openPay()` → mở `payDlg` (quick-pay tự build). Sẽ thay bằng mở đúng form **Phiếu thu tiền mặt** / **Phiếu thu ngân hàng** giống Mua hàng.
- Prefill: khách hàng, số tiền còn phải thu, lý do "Thu tiền phiếu bán {voucher_no}".
- Có thể dọn dẹp `payDlg` + `receiptMut` cũ nếu không còn dùng (giữ lại nếu vẫn cần ở nơi khác — kiểm tra rồi mới xoá).

## 3. Tái sử dụng Bank dialog

Bank form (`VoucherDialog`) hiện đang **khai báo nội bộ** trong `src/routes/_app/bank.vouchers.tsx` (không export). Phương án:

- **Tách ra component dùng chung** `src/components/bank-voucher-form.tsx` export `BankVoucherFormDialog({ type, open, onOpenChange, prefill? })`.
- Giữ nguyên logic hiện tại (chọn tài khoản NH, đối ứng, amount, sinh bút toán). Thêm prop `prefill` để truyền sẵn party, amount, reason.
- `bank.vouchers.tsx` import lại từ component dùng chung (không đổi behavior cũ).

Tương tự, `VoucherFormDialog` (cash, đã export ở `src/components/voucher-form.tsx`) sẽ nhận thêm prop `prefill?: { partyId?, partyName?, amount?, reason?, counterAccount? }` để Mua/Bán hàng truyền dữ liệu vào.

## 4. Mở form từ Mua/Bán hàng

Trong cả 2 trang thêm state:
```ts
const [cashDlg, setCashDlg] = useState<{ open:boolean; type:"receipt"|"payment"; prefill?:any }>({ open:false, type:"receipt" });
const [bankDlg, setBankDlg] = useState<{ open:boolean; type:"receipt"|"payment"; prefill?:any }>({ open:false, type:"receipt" });
```

Render `<VoucherFormDialog .../>` và `<BankVoucherFormDialog .../>` ngoài bảng. Click icon set state mở dialog với prefill phù hợp:
- Mua hàng → `type:"payment"`, counterAccount `331`, partyId = `supplier_id`.
- Bán hàng → `type:"receipt"`, counterAccount `131`, partyId = `customer_id`.

Sau khi lưu thành công, invalidate `["sales-vouchers"]` / `["purchase-vouchers"]` và ledgers để cột "Đã thanh toán / Còn phải thu/trả" cập nhật.

---

## Files sẽ chỉnh sửa / tạo

- (mới) `src/components/bank-voucher-form.tsx` — tách `VoucherDialog` bank thành component export, thêm prop `prefill`.
- `src/components/voucher-form.tsx` — thêm prop `prefill` (optional) cho cash dialog.
- `src/routes/_app/bank.vouchers.tsx` — dùng lại component dùng chung.
- `src/routes/_app/purchases/vouchers.tsx` — đổi tên cột; wire 2 icon mở dialog thật; render dialogs.
- `src/routes/_app/sales/vouchers.tsx` — thay `openPay`/`payDlg` cũ bằng mở `VoucherFormDialog`/`BankVoucherFormDialog`.

## Không nằm trong phạm vi (v1)

- Không thay đổi schema DB, không sửa server functions `createCashVoucher` / `createBankVoucher`.
- Không tự ghi sổ "đã thanh toán bao nhiêu" ngược lại phiếu mua/bán — phần này phụ thuộc backend đối soát hiện có (giữ nguyên cơ chế).