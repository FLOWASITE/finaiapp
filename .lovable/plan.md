## Vấn đề

Khi nhấn **Duyệt & ghi sổ** hóa đơn mua (vd: HĐ 00000104 — 03/03/2026):
- Bút toán (`journal_entries` + `journal_lines`) được tạo → badge "Đã ghi sổ" hiện.
- Nhưng **không** có dòng nào được thêm vào `purchase_vouchers` → danh sách "Phiếu mua hàng" trống.

Nguyên nhân: trong `approveInboxItem` (src/lib/inbox-ai.functions.ts, ~dòng 1169), nhánh `purchase_invoice` chỉ **TÌM** phiếu mua đã có sẵn (`select … where journal_entry_id = entry.id`) chứ không **TẠO** mới — trong khi nhánh `sales_invoice` gọi `materializeSalesVoucherFromDocument` để tự tạo.

## Giải pháp

Bổ sung hàm đối xứng `materializePurchaseVoucherFromDocument` và gọi nó trong `approveInboxItem` (chỉ thay đổi backend, không đụng UI).

### 1. Thêm hàm `materializePurchaseVoucherFromDocument` (src/lib/inbox-ai.functions.ts)

Đối xứng với `materializeSalesVoucherFromDocument`, nhưng cho hóa đơn mua:

- Đọc document + `ai_uploads.parsed._einvoice` + `ocr_extracted` → lấy `seller` (NCC), `totals`, `lines`.
- **Idempotent**: nếu đã có `purchase_vouchers` với cùng `journal_entry_id` → trả id, không tạo lại.
- **Resolve supplier**:
  - Khớp theo `supplier_tax_id` trong `suppliers`; nếu không có thì khớp theo `name`.
  - Nếu vẫn chưa có → tự tạo NCC mới với code `NCC#####` (auto-increment giống `KH#####`).
- **Sinh số phiếu** `PMYYYY-#####` (PM = Phiếu Mua) — query `purchase_vouchers.voucher_no ilike 'PMYYYY-%'` lấy max + 1.
- **Tài khoản mặc định**:
  - `debit_account = "156"` (cho dòng hàng — line-level sẽ override từ classification engine kết quả 152/153/156/242/211/213 nếu có trong `ai_uploads.parsed`).
  - `credit_account = "331"` (công nợ NCC).
  - `vat_account = "1331"` nếu `vat > 0`.
- **Insert `purchase_vouchers`** với: `tenant_id`, `user_id`, `voucher_no`, `voucher_date = issue_date`, `supplier_*`, `invoice_no` (từ einvoice), `invoice_date`, `subtotal`, `vat_amount`, `vat_rate`, `total`, `payment_method = 'credit'`, `payment_status = 'unpaid'`, `status = 'posted'`, `posted_at = now()`, `journal_entry_id = entry.id`, `notes = "Tự tạo từ Inbox AI khi duyệt chứng từ"`.
- **Insert `purchase_voucher_lines`** từ `rawLines` (qty/unit_price/amount/vat_rate/vat_amount/total, `line_type = 'goods'`, `debit_account` theo classification nếu có, fallback 156).

### 2. Cập nhật `approveInboxItem` (cùng file, ~dòng 1169)

Thay khối "chỉ tìm phiếu cũ" bằng:

```ts
} else if (docMeta?.doc_kind === "purchase_invoice") {
  const pvId = await materializePurchaseVoucherFromDocument(supabase, {
    documentId: data.external_id,
    tenantId, userId,
    entryDate: data.entry_date,
    journalEntryId: entry.id,
  });
  if (pvId) {
    const { data: pvRow } = await supabase
      .from("purchase_vouchers")
      .select("id, voucher_no").eq("id", pvId).maybeSingle();
    if (pvRow) postedVoucher = { kind: "purchase_voucher", id: pvRow.id, voucher_no: pvRow.voucher_no };
  }
}
```

### 3. Mở rộng `assertNoDuplicateEInvoice` (chống ghi sổ trùng cho hóa đơn mua)

Hiện hàm chỉ check `sales_invoice` ↔ `sales_vouchers`. Thêm nhánh cho `purchase_invoice`:
- Query `purchase_vouchers` theo `invoice_no` (+ optional `series` nếu schema có cột tương ứng — schema hiện tại chỉ có `invoice_no`, dùng `invoice_no` thuần).
- Throw lỗi tương tự nếu trùng và phiếu chưa void.

## Tệp cần sửa

- `src/lib/inbox-ai.functions.ts` — thêm 1 hàm helper, sửa 1 nhánh trong `approveInboxItem`, mở rộng `assertNoDuplicateEInvoice`.

Không cần migration DB (schema `purchase_vouchers` đã đủ cột). Không thay đổi UI — sau khi sửa, HĐ 00000104 khi duyệt sẽ tự sinh phiếu `PM2026-00001` (hoặc số kế tiếp) và hiển thị trong danh sách Phiếu mua hàng.

## Kiểm thử sau khi build

1. Vào Inbox AI → chọn HĐ mua chưa ghi sổ → Duyệt & ghi sổ.
2. Kiểm tra danh sách **Phiếu mua hàng**: phải có phiếu mới với đúng NCC, số HĐ, tổng tiền.
3. Duyệt lại lần 2 cùng HĐ → phải bị chặn (duplicate einvoice).
4. Kiểm tra `journal_entry_id` của phiếu trỏ đúng bút toán vừa tạo.
