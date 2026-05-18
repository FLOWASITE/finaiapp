# Phân hệ Hoá đơn điện tử (HĐĐT) — kết nối TCT

MVP: tách riêng module `/einvoices` với 2 tab **Đầu ra** / **Đầu vào**, hỗ trợ import XML thủ công + đồng bộ tự động từ `hoadondientu.gdt.gov.vn`. Liên kết 2 chiều với `sales_invoices` (đầu ra) và `invoices` (đầu vào).

## Sơ đồ

```text
[Cổng TCT]  ⇄  einvoice-sync (server fn) ──┐
[XML/ZIP user upload] ──► einvoice-xml ────┤──► table: einvoices
                                            │      │
                                            │      ├─ link sales_invoices (đầu ra)
                                            │      └─ link invoices (đầu vào)
                                            │
                                       table: einvoice_credentials (mã hoá)
                                       table: einvoice_sync_logs
```

## Phase 1 — Schema + UI khung (không cần secret)

### Bảng mới (migration)

- `einvoices` — kho HĐĐT chuẩn hoá:
  - `id, tenant_id, user_id, direction ('in'|'out'), source ('xml_upload'|'tct_sync'|'manual')`
  - Định danh: `seller_tax_id, seller_name, buyer_tax_id, buyer_name`
  - HĐ: `invoice_series, invoice_template, invoice_no, issue_date, currency, exchange_rate`
  - Tiền: `subtotal, vat_amount, total`
  - TCT: `tct_lookup_code` (mã tra cứu), `tct_status` (`valid|cancelled|replaced|adjusted|pending`), `tct_signed_at`, `tct_mcct` (mã CQT), `tct_raw` (jsonb)
  - File: `xml_path` (storage), `pdf_path`
  - Reconcile: `matched_sales_invoice_id`, `matched_purchase_invoice_id`, `match_score`
  - `created_at, updated_at` + RLS theo `tenant_id` (cùng pattern `is_tenant_member` / `has_tenant_role`)
  - Unique: `(tenant_id, direction, seller_tax_id, invoice_series, invoice_no)`
- `einvoice_lines` — dòng hàng (description, qty, unit_price, vat_rate, amount), RLS qua parent.
- `einvoice_credentials` — credentials TCT mỗi tenant:
  - `tenant_id (uuid, unique), username (text), password_encrypted (text)` — mã hoá bằng `pgsodium` hoặc AES với key `EINVOICE_ENC_KEY` (secret). RLS: chỉ `owner/admin` của tenant đọc/ghi.
- `einvoice_sync_logs` — `tenant_id, started_at, finished_at, direction, status, fetched_count, error`. RLS: tenant member đọc.
- Storage bucket `einvoices` (private) — lưu XML/PDF gốc.

### Routes & UI

- `src/routes/_app/einvoices/index.tsx` — layout 2 tab `?tab=out|in`, mặc định `out`.
  - Toolbar: tìm theo MST/số HĐ/mã tra cứu, lọc theo khoảng ngày, trạng thái TCT, đã đối chiếu chưa.
  - Bảng: ngày, số HĐ, MST đối tác, tên, tổng, trạng thái TCT (badge), đã ghi nhận (link tới sales/purchase invoice), action menu.
  - Nút: **Import XML**, **Đồng bộ từ TCT** (mở dialog credentials nếu chưa cấu hình).
- `src/routes/_app/einvoices/$id.tsx` — chi tiết: header HĐ, bảng dòng hàng, raw JSON từ TCT (collapsible), nút **Tải XML**, **Tạo phiếu chi/Ghi nhận mua hàng** (đầu vào) hoặc **Liên kết với HĐ bán hàng** (đầu ra).
- Sidebar: thêm mục **Hoá đơn điện tử** dưới nhóm Kế toán, đặt giữa **Bán hàng** và **Mua hàng**.

### Server functions (mới, không cần TCT)

- `src/lib/einvoices.functions.ts`:
  - `listEInvoices({ direction, q, dateFrom, dateTo, status, page })` — query với phân trang.
  - `getEInvoice(id)` — chi tiết + lines + signed URL XML.
  - `linkEInvoiceToInvoice({ einvoiceId, targetId, kind })` — set `matched_*_id`.
  - `createPurchaseFromEInvoice(einvoiceId)` — tạo `invoices` + lines từ HĐ đầu vào.
  - `bulkSetStatus(ids, status)` — bookkeeping nội bộ.

## Phase 2 — Import XML 2 chiều (mở rộng cái có sẵn)

Đã có `src/lib/einvoice-xml.functions.ts` + `src/components/import-einvoice-xml-dialog.tsx` (đang ghi thẳng `invoices/sales_invoices`). Refactor:

- Đổi đích ghi: parse XML → ghi vào `einvoices` trước (kèm `xml_path` upload storage), **rồi** chạy bước "ghi nhận" tạo `invoices`/`sales_invoices` (giữ hành vi cũ làm tuỳ chọn "Ghi nhận ngay sau import").
- Hỗ trợ ZIP (giải nén client-side với `jszip`).
- Phát hiện trùng theo `(seller_tax_id, invoice_series, invoice_no)` — đánh dấu `duplicate` thay vì lỗi cứng.
- Giữ chiều cũ: nếu seller_tax_id = MST tenant → `direction='out'`, ngược lại `direction='in'`.

## Phase 3 — Đồng bộ TCT (cần secret + xử lý captcha)

⚠️ **Lưu ý quan trọng cần xác nhận**:

`hoadondientu.gdt.gov.vn` **không có API công khai**. Cách duy nhất kéo HĐ tự động là dùng tài khoản TCT của tổ chức:

1. **Đăng nhập** `POST /security-taxpayer/authenticate` với `username` (MST hoặc MST-id), `password`, **`cvalue` (captcha)**.
2. **List HĐ**: `GET /query/invoices/purchase` (đầu vào), `/sold` (đầu ra) với header `Authorization: Bearer <token>` + filter `?search=tdlap=ge=...;tdlap=le=...`.
3. **Tải XML**: `GET /query/invoices/export-xml/{id}`.

**Vấn đề captcha**: TCT yêu cầu captcha ở bước login → không thể tự động hoá hoàn toàn không-người-dùng. Các lựa chọn:

- **3a (đề xuất MVP)**: Mỗi lần đồng bộ, mở dialog hiển thị ảnh captcha (gọi `GET /captcha` từ server fn rồi trả base64 về client), user nhập tay → submit. Token sống ~30 phút, đủ kéo nhiều range.
- **3b**: Tích hợp dịch vụ giải captcha (2Captcha / Anti-Captcha) — cần secret + tốn phí, độ chính xác ~95%.
- **3c**: Bỏ Phase 3, chỉ giữ import XML thủ công.

**Lưu credentials**: mã hoá với `EINVOICE_ENC_KEY` (sẽ yêu cầu qua `add_secret`). Decrypt chỉ trong server fn, không bao giờ trả về client.

**Server functions**:

- `src/lib/einvoice-tct.functions.ts` (server-only helpers ở `einvoice-tct.server.ts`):
  - `tctRequestCaptcha()` → `{ key, image_base64 }`
  - `tctLogin({ username, password, captchaKey, captchaValue })` → lưu `password_encrypted`, trả `sessionToken` (memory cache 25').
  - `tctSyncRange({ direction, from, to, captchaKey, captchaValue })` → loop pagination, upsert vào `einvoices`, tải XML vào storage, ghi `einvoice_sync_logs`.
- UI: nút "Đồng bộ TCT" mở `SyncDialog` — bước 1 chọn khoảng ngày, bước 2 nhập captcha, bước 3 progress + kết quả (đếm mới/trùng/lỗi).

## Thay đổi không thuộc MVP (loại trừ)

- ❌ Phát hành HĐĐT đầu ra qua TVAN (Phase 4 sau, cần chọn VNPT/Viettel/MISA + ký HSM).
- ❌ Kết nối trực tiếp cổng nhận TT78/NĐ123 (cần đăng ký với TCT + chứng thư số).
- ❌ Bót OCR PDF HĐĐT (đã có pipeline `extractInvoice` cho ảnh; giữ riêng).

## Câu cần xác nhận trước khi build

1. **Phase 3 đi theo 3a (captcha thủ công), 3b (2Captcha trả phí) hay tạm bỏ?** — ảnh hưởng đến việc có cần thêm secret `EINVOICE_ENC_KEY` (+ `CAPTCHA_API_KEY` nếu 3b).
2. **OK với việc lưu password TCT đã mã hoá trong DB?** (chỉ owner/admin tenant đọc; mã hoá server-side). Nếu không OK → mỗi lần đồng bộ phải nhập lại cả username + password + captcha.
3. Đổi `import-einvoice-xml-dialog` hiện tại sang ghi vào `einvoices` trước (Phase 2) có ảnh hưởng tới flow nào bạn đang dùng không? Nếu cần giữ nguyên hành vi "import là ghi thẳng vào purchases", mình sẽ giữ option đó.

Trả lời 1-2 ý trên là mình bắt tay Phase 1+2 ngay, Phase 3 làm sau khi có secret.
