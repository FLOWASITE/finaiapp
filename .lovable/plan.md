## Mục tiêu

Bổ sung 3 cột cuối cho bảng phiếu của 2 màn hình:
- `/cash` — tab "Phiếu thu / chi"
- `/bank/vouchers` — bảng phiếu thu/chi/CK ngân hàng

Mỗi dòng có:
1. **Trạng thái hạch toán** — badge "Đã hạch toán" (xanh, check) / "Chưa hạch toán" (xám) dựa trên `journal_entry_id`.
2. **Tài liệu đính kèm** — icon kẹp giấy + số lượng file. Click mở popover liệt kê file (tên + nút tải về). Nếu chưa có → icon mờ + nút "+ Đính kèm".
3. **Nhóm hành động cuối dòng** — nút mắt (Xem phiếu) + menu 3-chấm với: Chỉnh sửa, In phiếu chi/thu, Nhân bản, Xóa (giống mockup).

## Thay đổi chi tiết

### Backend (server functions)

**`src/lib/cash.functions.ts`** — `listCashVouchers`:
- Sau khi lấy `cash_vouchers`, query `document_links` với `entity_table='cash_vouchers'` và `entity_id IN (...)`, gom theo voucher_id.
- Join `documents` lấy `id, original_filename, storage_path, mime_type` để có thể tải về.
- Trả về thêm `attachments: Array<{id, filename, storage_path, mime_type}>` cho mỗi voucher. `journal_entry_id` đã có sẵn.

**`src/lib/bank.functions.ts`** — `listBankVouchers`: tương tự với `entity_table='bank_vouchers'`.

### Frontend

**Component mới `src/components/voucher-row-actions.tsx`**:
- Props: `attachments`, `entityTable`, `entityId`, `voucherNo`, `onView`, `onEdit`, `onDuplicate`, `onDelete`, `onPrint`.
- Render:
  - Cột Trạng thái: `<PostedBadge posted={!!journalEntryId} />`
  - Cột Tài liệu: Popover với danh sách file (link tải qua signed URL của Supabase storage hoặc `documents.functions.ts` helper hiện có) + nút đính kèm thêm (mở `AttachInvoiceFile`).
  - Cột Hành động: Button icon `Eye` (xanh) + DropdownMenu (3-chấm) với Chỉnh sửa / In phiếu / Nhân bản / Xóa.

**`src/routes/_app/cash/index.tsx`**:
- Thêm 3 `<th>` cuối: "Trạng thái", "Tài liệu", "" (actions).
- Render component mới cho mỗi dòng.
- Wiring: Xem/Chỉnh sửa mở `VoucherFormDialog` ở chế độ view/edit (nếu chưa hỗ trợ thì chỉ mở dialog readonly cho v1); Xóa gọi `deleteCashVoucher` (đã có hay tạo mới nếu chưa); In + Nhân bản hiển thị toast "đang phát triển" để khớp pattern hiện tại trong `purchases/vouchers.tsx`.

**`src/routes/_app/bank.vouchers.tsx`**:
- Tương tự: thêm 3 `<th>` (cập nhật `colSpan` empty state từ 9 → 12).
- Thay nút Xóa hiện tại bằng dropdown đầy đủ; mutation xóa đã có (`deleteBankVoucher`).

### Phạm vi giới hạn (v1)
- **Tải file**: dùng `supabase.storage.from(bucket).createSignedUrl(...)` ở client; nếu cấu trúc khác (đã có helper `getDocumentSignedUrl`) sẽ tái sử dụng.
- **Xem/Chỉnh sửa/Nhân bản/In** ở bank: trước mắt mở dialog read-only hoặc toast "đang phát triển" — không xây mới form edit trong phạm vi này.
- Không đổi schema DB, không thêm trường mới.

## Files sẽ chỉnh

- `src/lib/cash.functions.ts` (mở rộng `listCashVouchers`)
- `src/lib/bank.functions.ts` (mở rộng `listBankVouchers`)
- `src/components/voucher-row-actions.tsx` (mới)
- `src/routes/_app/cash/index.tsx`
- `src/routes/_app/bank.vouchers.tsx`
