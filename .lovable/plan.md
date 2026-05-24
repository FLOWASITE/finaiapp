# Hoàn thiện sheet "Đề xuất của Fin"

Cập nhật `src/components/inbox/inbox-item-sheet.tsx` (và mở rộng `InboxItem` ở `src/lib/ai/inbox-types.ts` + builder ở `src/lib/ai/inbox-reason.server.ts`) theo 2 hướng:

## 1) Đổi tên & nút "Xem hóa đơn"

- Đổi tiêu đề header: **"Đề xuất của Sổ AI" → "Đề xuất của Fin"** (kèm icon `Sparkles` giữ nguyên).
- Thêm nút **"Xem hóa đơn"** ngay cạnh khối Đối tác/Số tiền:
  - Hiển thị khi `item.source ∈ {document, tct_einvoice, email_forward}` hoặc khi `item.match_ref` trỏ tới `invoice` / `sales_invoice`.
  - Bấm vào mở `Dialog` toàn màn hình dùng lại `<InvoiceFileViewer />` đã có (PDF / ảnh / XML einvoice).
  - Nguồn dữ liệu:
    - Với `source = document`: gọi `getDocument({ data: { id: item.external_id } })` (đã trả `signedUrl`, `mimeType`, `original_filename`, và `doc.invoice_id` để lấy einvoice nếu có).
    - Với bank item có `match_ref`: mở route `item.href` (Đối soát) thay vì viewer — dùng nút phụ "Mở phiếu khớp".
  - Trạng thái loading dùng `useQuery` + skeleton trong dialog; lỗi → toast.
- Nút phụ trong footer header cluster: icon `FileText` + label rút gọn để vẫn đẹp ở viewport 707px.

## 2) Bổ sung trường theo loại phiếu

Thêm field tuỳ chọn vào `InboxItem.proposal` (giữ ngược tương thích):

```ts
proposal: {
  voucher_kind: "purchase_invoice" | "sales_invoice" | "bank_receipt"
              | "bank_payment" | "cash_receipt" | "cash_payment"
              | "ai_insight";
  meta?: Record<string, string | number | null>;  // tuỳ kind
  ...existing
}
```

Builder điền `meta` theo loại; sheet render khối **"Thông tin phiếu"** (grid 2 cột, label nhỏ uppercase + value) phía trên khối Bút toán:

- **purchase_invoice** (document/tct/email): `supplier_tax_id`, `invoice_no`, `invoice_series`, `invoice_date`, `subtotal`, `vat_rate`, `vat_amount`, `total`, `payment_method`, `due_date`.
- **sales_invoice** (qua match_ref khi bank thu): `customer_name`, `customer_tax_id`, `invoice_no`, `invoice_date`, `subtotal`, `vat_amount`, `total`, `due_date`.
- **bank_receipt / bank_payment**: `bank_account` (TK 112 chi tiết), `bank_name`, `txn_date`, `txn_ref`, `counterparty`, `counterparty_account`, `memo`, `matched_invoice_no`.
- **cash_receipt / cash_payment**: `cash_fund` (TK 111 chi tiết), `txn_date`, `payer_or_payee`, `reason`, `attachment_ref`.
- **ai_insight**: `severity`, `category`, `period`, `metric`, `delta`.

Sheet:
- Khối mới `<VoucherMetaGrid kind meta />` đặt giữa Trust strip và Reasoning.
- Field rỗng → ẩn (không render `—`); tiền hiển thị `tabular-nums`, ngày `dd/MM/yyyy`.
- Chip "Loại phiếu" nhỏ kế bên confidence trong header (vd: "Phiếu mua hàng", "Báo có NH", "AI cảnh báo").

## Thay đổi file

- `src/lib/ai/inbox-types.ts` — thêm `voucher_kind` + `meta` vào `Proposal`.
- `src/lib/ai/inbox-reason.server.ts` — set `voucher_kind` + bơm `meta` trong `buildDocumentItem`, `buildBankItem`, `buildInsightItem`.
- `src/components/inbox/inbox-item-sheet.tsx`:
  - Đổi title, thêm chip kind.
  - Thêm `InvoiceViewerButton` + `Dialog` dùng `InvoiceFileViewer`.
  - Thêm `VoucherMetaGrid` component nội bộ + map nhãn tiếng Việt.
- Không đổi business logic duyệt/ghi sổ, không đổi RLS/migrations.

## Ghi chú phạm vi

- Chỉ là thay đổi UI + bơm thêm metadata từ dữ liệu đã có (OCR `ocr_extracted`, bank txn, AI insight). Không gọi API mới ngoại trừ `getDocument` (đã tồn tại).
- Giữ swipe-to-close, footer hành động, lịch sử chat như hiện tại.
