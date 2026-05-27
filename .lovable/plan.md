## Vấn đề
Hiện tại nút "Xem phiếu" trong Inbox AI (sau khi đã Duyệt & ghi sổ) điều hướng đến `/purchases/vouchers` hoặc `/sales/vouchers` — tức là trang danh sách. Người dùng muốn nó mở thẳng dialog chi tiết phiếu đã ghi sổ.

## Giải pháp
Dùng search param `edit=<voucher_id>` để truyền ID phiếu qua URL, sau đó tự động mở dialog chi tiết khi trang load.

## Thay đổi

### 1. `src/components/inbox/inbox-item-sheet.tsx`
- Sửa nút "Xem phiếu": điều hướng đến `/purchases/vouchers?edit=<id>` hoặc `/sales/vouchers?edit=<id>` thay vì chỉ `/purchases/vouchers` / `/sales/vouchers`.

### 2. `src/routes/_app/purchases/vouchers.tsx`
- Thêm `edit` vào `validateSearch`.
- Thêm `useEffect`: khi `searchParams.edit` tồn tại, tự động set `editId` và mở dialog (tương tự cơ chế `searchParams.new` hiện có).
- Sau khi mở dialog, clear `edit` khỏi URL bằng `replace: true`.

### 3. `src/routes/_app/sales/vouchers.tsx`
- Thêm `edit` vào `validateSearch`.
- Thêm `useEffect`: khi `searchParams.edit` tồn tại, tự động gọi `openEdit(searchParams.edit)` và mở dialog.
- Sau khi mở dialog, clear `edit` khỏi URL bằng `replace: true`.

## Kết quả mong đợi
Người dùng nhấn "Xem phiếu" → mở thẳng dialog chi tiết phiếu mua hàng / bán hàng, không còn chỉ mở trang danh sách.