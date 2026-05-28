## Mục tiêu
Sửa bug nghiệp vụ P0: không còn trạng thái bút toán tổng Nợ 156 nhưng mặt hàng lại được tạo/resolve theo TK 153. “Mục đích mua hàng” sẽ trở thành nguồn sự thật duy nhất cho cả bút toán, danh sách mặt hàng sẽ tạo, và dữ liệu gửi khi duyệt.

## Phạm vi sửa

### 1. P0 — Đồng bộ mục đích → bút toán → mặt hàng
- Thêm state `purchasePurpose` ở màn Inbox, lưu theo từng `InboxItem` đang mở.
- Suy ra mặc định từ bút toán hiện tại nếu có: `156 = resale`, `152 = material`, `642 = expense`; nếu không thì fallback theo đề xuất hiện tại.
- Khi KTV chọn mục đích mới trong `PurposePicker`, không chỉ mở màn sửa nữa mà gọi `onPurposeChange` để tạo một bản `InboxItem` đã được propagate:
  - Bút toán debit chính đổi sang đúng TK mục đích.
  - Các dòng hàng/mặt hàng mới trong `missing.products` đổi cùng loại:
    - `resale` → `item_type: goods`, `account: 156`
    - `material` → `item_type: material`, `account: 152`
    - `expense` → `item_type: service`, `account: 642`
  - UI “Cần tạo mới” hiển thị ngay TK mới, không còn 153 khi đang chọn 156.
- Khi bấm “Duyệt & ghi sổ”, client gửi thêm `purchase_purpose` vào `approveInboxItem` để server không phải đoán lại.

### 2. P0 — Server dùng cùng một nguồn sự thật khi duyệt
- Mở rộng input `approveInboxItem` nhận `purchase_purpose` cho chứng từ mua.
- Truyền mục đích này vào `autoResolveMissingMaster` để tự tạo products theo đúng TK KTV đã duyệt, thay vì chạy lại classifier và tự rơi về 153.
- Truyền mục đích này vào `materializePurchaseVoucherFromDocument` để:
  - `purchase_vouchers.debit_account` khớp với bút toán đã ghi.
  - `purchase_voucher_lines.debit_account` khớp từng dòng.
  - Nếu mục đích là chi phí `642`, dòng sẽ là service/expense-style, không tạo tồn kho theo 156/153.
- Thêm guard trước khi insert journal: nếu là purchase invoice và `purchase_purpose` có account mục tiêu, các dòng debit nghiệp vụ phải khớp account này; nếu lệch thì normalize hoặc báo lỗi rõ, tránh ghi sổ sai âm thầm.

### 3. P1 — Bỏ default 153 nguy hiểm cho cây cảnh/new product trong flow này
- Với missing products trong panel duyệt, nếu KTV đã chọn mục đích, nhãn phân loại lấy từ mục đích, không lấy lại confidence 99% từ classifier.
- Không hiển thị “99%” như một khẳng định chắc chắn cho item mới khi thực chất chưa có mã trong hệ thống.
- Đổi nhãn sang rõ nghĩa hơn, ví dụ “sẽ tạo TK 156” / “sẽ hạch toán 642”, hoặc chỉ hiển thị TK + loại.

### 4. P2 — Dọn UI trùng lặp sau khi sync
- Bỏ `ApprovalChecklist` chips ở footer vì đã trùng với block “Tin cậy 60% — cần anh xác nhận”.
- Đưa thông tin “7 mặt hàng sẽ tạo với TK …” sát block “Mục đích mua hàng” hoặc làm subtitle trong block “Cần tạo mới”, để KTV thấy chọn radio sẽ ảnh hưởng trực tiếp tới mặt hàng.

## File dự kiến sửa
- `src/components/inbox/inbox-item-sheet.tsx`: biến `PurposePicker` thành control thật, propagate UI cho missing products, bỏ footer checklist.
- `src/routes/_app/inbox.tsx`: giữ state mục đích theo item, truyền item đã sync vào duyệt, gửi `purchase_purpose` lên server.
- `src/lib/ai/inbox-types.ts`: thêm type mục đích mua hàng dùng chung.
- `src/lib/inbox-ai.functions.ts`: nhận `purchase_purpose`, auto-create product và materialize purchase voucher theo mục đích đã duyệt.

## Kết quả sau fix
```text
KTV chọn Hàng hoá bán lại (156)
  → Bút toán: Nợ 156
  → 7 mặt hàng: sẽ tạo Hàng hoá / TK 156
  → Products tạo ra: stock_account 156
  → Purchase voucher lines: debit_account 156

KTV chọn Chi phí sự kiện (642)
  → Bút toán: Nợ 642
  → 7 dòng: chi phí/dịch vụ, không nhập tồn kho
  → Products/service nếu tạo: service / expense 642
  → Purchase voucher lines: debit_account 642
```

## Kiểm tra sau triển khai
- Mở lại case Thanh Vân Farm: đổi radio 156/152/642 và xác nhận bút toán + danh sách “Cần tạo mới” đổi cùng nhau.
- Kiểm tra payload approve có `purchase_purpose`.
- Kiểm tra không còn chip checklist trùng ở footer.
- Kiểm tra TypeScript/build tự động của hệ thống không báo lỗi.