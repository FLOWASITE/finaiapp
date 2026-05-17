# Hoàn thiện Phân hệ Bán hàng

Phạm vi rộng → triển khai theo **7 phase** đóng gói. Mỗi phase tự đứng được, có thể duyệt từng cái. Phase 1–3 là core value (đa số khách hàng dùng), Phase 4–7 mở rộng.

## Tổng quan luồng nghiệp vụ

```text
Báo giá (Quote) ──► Đơn bán (SO) ──► Phiếu giao (DN) ──► Hoá đơn (Invoice) ──► Phiếu thu (Receipt)
                                                              │
                                                              ├─► Credit Note (điều chỉnh/trả hàng)
                                                              └─► Recurring (định kỳ)
```

---

## Phase 1 — Customer Master + Bộ khung dữ liệu

**Migration `tenants/sales/v2`**

- Mở rộng `customers`: `code`, `payment_terms_days`, `currency`, `opening_balance`, `email_cc`, `contact_person`, `notes`, `is_active`. Validation trigger: `code` unique trong tenant.
- Mở rộng `sales_invoices`: `discount_percent`, `discount_amount`, `shipping_fee`, `other_fees`, `fx_rate`, `payment_status` (unpaid/partial/paid/overdue), `paid_amount`, `due_date`, `payment_terms_days`, `billing_address`, `shipping_address`, `customer_email`, `quote_id`, `sales_order_id`, `einvoice_template_id`, `send_status`, `sent_at`.
- Mở rộng `sales_invoice_lines`: `line_discount_percent`, `line_discount_amount`, `vat_code` (text: `0`/`5`/`8`/`10`/`KCT`/`KKKNT`), `pre_vat_amount`, `vat_amount`.
- Bảng mới `customer_receipts` (mirror `supplier_payments`): `invoice_id`, `customer_id`, `pay_date`, `method`, `amount`, `reference`, `journal_entry_id`. RLS + trigger refresh `sales_invoices.payment_status`.
- Tất cả bảng mới có RLS theo `tenant_id` + `has_tenant_role` (owner/admin/accountant).

**Code mới**

- `src/lib/customers.functions.ts` — list/get/upsert/archive.
- `src/lib/vat-codes.ts` — danh mục mã thuế VN + helper `calcLineTax`.
- `src/components/customer-combobox.tsx` — popover search + nút "Tạo mới nhanh".
- `src/routes/_app/customers/index.tsx` — table + dialog CRUD (theo style settings/index.tsx).

---

## Phase 2 — Editor Hoá đơn nâng cấp

**Mục tiêu**: thay editor hiện tại bằng form đầy đủ chuẩn Xero/QB.

- `src/routes/_app/sales/new.tsx` + `sales/$id/edit.tsx` — editor mới (full-page, không dialog).
  - Header: Khách hàng (customer-combobox, auto-fill địa chỉ/email/term), Ngày HĐ, Ngày đến hạn (auto = +term), Tham chiếu, Ghi chú công khai.
  - Tiền tệ: chọn VND/USD/EUR…, auto lấy `fx_rate` từ `exchange_rates`, cảnh báo nếu thiếu.
  - Bảng dòng: Sản phẩm (combobox), Diễn giải, SL, Đơn giá, **Chiết khấu (%/số)**, **Mã thuế** (select), Thành tiền sau thuế.
  - Tổng kết phải: Cộng tiền hàng → Chiết khấu HĐ (% hoặc số) → Phí vận chuyển → Phí khác → Thuế GTGT (chi tiết từng mã) → **Tổng thanh toán**.
  - Sticky action bar: Lưu nháp / Lưu & Phát hành / Lưu & In / Lưu & Gửi email.
- `upsertSalesInvoice` & `issueSalesInvoice` cập nhật:
  - Tính lại subtotal/vat/discount/total bám đúng mã thuế (KCT/KKKNT không tạo dòng 33311).
  - Multi-currency: lưu cả `total` (ngoại tệ) và `total_vnd = total * fx_rate`; bút toán hạch toán bằng VND.
  - Phân bổ chiết khấu HĐ về từng dòng để tính VAT đúng.
- Server fn mới `voidSalesInvoice` (hủy + reverse bút toán nếu chưa thu).

---

## Phase 3 — Phiếu thu + Theo dõi công nợ + PDF + Email

**Phiếu thu (Customer Receipts)**

- `src/lib/receipts.functions.ts`: `listReceipts`, `recordReceipt` (auto bút toán Nợ 111/112 / Có 131, set `payment_status`), `deleteReceipt`.
- Tại trang `sales/$id`: panel "Lịch sử thanh toán" + nút "Ghi nhận thanh toán" mở dialog (ngày, số tiền, phương thức, tham chiếu).
- Cập nhật `receivables` để dùng `payment_status` thay vì tính lại từ đầu.

**PDF + In**

- Component `src/components/invoice-print-template.tsx` — layout chuẩn TT78: logo + thông tin DN (lấy từ tenant), thông tin khách, bảng dòng, tổng tiền, người ký, mã CQT + QR.
- Route `src/routes/_app/sales/$id.print.tsx` — render template + auto `window.print()` (no extra dep, dùng `@media print` CSS).
- Server fn `generateInvoicePdf` dùng `@react-pdf/renderer` (Worker-compatible) trả base64 để dùng cho email.

**Email**

- Nếu hạ tầng email chưa thiết lập, gọi `setup_email_infra` + `scaffold_transactional_email` trước.
- Server fn `sendInvoiceEmail(invoiceId, to, cc, subject, body)`: tạo PDF, push vào hàng đợi email, đánh dấu `send_status='sent'`, `sent_at=now()`.
- UI: dialog "Gửi email" trong trang chi tiết (prefill từ customer.email).

**Dashboard bán hàng**

- Trang `/sales` redesign: 4 KPI cards (Doanh thu tháng, Doanh thu YTD, Công nợ chưa thu, Quá hạn), filter (khoảng ngày, trạng thái, khách hàng, mã thuế), search invoice_no/customer, export CSV.

---

## Phase 4 — Credit Note (Hoá đơn điều chỉnh/trả hàng)

- Bảng `credit_notes` + `credit_note_lines` (FK → `sales_invoices`).
- Route `/sales/credit-notes` list + form. Nút "Tạo CN" từ trang chi tiết HĐ → prefill dòng từ HĐ gốc, cho phép giảm SL/tiền.
- Server fn `issueCreditNote`: bút toán đảo (Nợ 5213 — Hàng bán bị trả lại / Nợ 33311 / Có 131), nếu liên quan tồn kho → tạo `stock_movements` "in" và đảo COGS.

---

## Phase 5 — Quote / Sales Order / Delivery Note

- 3 module song song, schema giống `sales_invoices` (header + lines + status).
- `quotes`: status `draft/sent/accepted/rejected/expired`, có `valid_until`. Nút "Convert to SO" hoặc "Convert to Invoice".
- `sales_orders`: status `open/partial/fulfilled/cancelled`, link tới Quote/Invoice.
- `delivery_notes`: status `draft/delivered/cancelled`, khi xác nhận → tạo `stock_movements` "out" + giảm `on_hand`.
- Routes `/sales/quotes`, `/sales/orders`, `/sales/deliveries` cùng pattern list + editor.

---

## Phase 6 — Recurring Invoices

- Bảng `recurring_invoices`: customer, lines template (jsonb), `frequency` (monthly/quarterly/yearly), `next_run_date`, `until_date`, `is_active`, `last_invoice_id`.
- Route `/sales/recurring` quản lý.
- Server route public `/api/public/cron/recurring-invoices` (xác thực header `x-cron-secret`) — sinh HĐ nháp khi `next_run_date <= today`, advance `next_run_date`. Người dùng cấu hình pg_cron gọi URL stable này.

---

## Phase 7 — E-invoice Provider Schema (chuẩn bị provider thật)

- Bảng `einvoice_providers` (1 dòng/tenant): `provider` (viettel/vnpt/misa/easyca/m_invoice/mock), `api_url`, `username`, `password_encrypted`, `default_template_id`, `test_mode`.
- Bảng `einvoice_templates`: `symbol` (ký hiệu, vd `1C25TAA`), `template_no` (số mẫu `1/001`), `series`, `current_no`, `is_default`.
- Tab "Hoá đơn điện tử" trong Settings để cấu hình provider + template.
- Refactor `issueSalesInvoice`: lấy template default → tăng `current_no` → format `invoice_no`. Tách `provider-adapter.ts` với interface `IssueEInvoice(payload) → {code, qr, xml}` + 1 implementation `MockAdapter` để giữ hành vi hiện tại; các provider thật để stub `throw new Error("TODO: tích hợp ${provider}")`.

---

## Technical details (cho người triển khai)

**Tech stack**
- Migration đơn lẻ cho mỗi phase (tránh patch khổng lồ).
- Server logic: `createServerFn` + `requireSupabaseAuth` (không Edge Function).
- PDF: `@react-pdf/renderer` (pure JS, chạy được trong Worker SSR).
- Email: dựa vào `email_domain.setup_email_infra` + `scaffold_transactional_email` đã có.
- Form: react-hook-form + Zod (như Setup Wizard).

**Tax code mapping (Phase 2)**
```text
0     → 0% chịu thuế, có dòng 33311=0
5/8/10 → tỷ lệ tương ứng, có dòng 33311
KCT   → Không chịu thuế (xuất khẩu, miễn), không tạo 33311
KKKNT → Không kê khai nộp thuế (hỗ trợ, trợ cấp), không 33311
```

**Đề nghị tiến độ**
1. Phase 1 (Customer + schema) — duyệt rồi triển khai.
2. Phase 2 + 3 trong cùng một bước (gắn liền nhau, không tách được).
3. Phase 4–7 mỗi cái 1 bước riêng theo nhu cầu.

Bắt đầu từ **Phase 1** nhé?