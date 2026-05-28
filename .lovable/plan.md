## Vấn đề thực tế

1. Bạn approve document `8f085f9d` (HĐ 00002847, TUYỀN HƯNG PHÚ) lúc 01:51:25.
   - Hệ thống **đã tạo** `journal_entries.0c1303ce` (toast "Đã ghi sổ" là thật).
   - **Không tạo** `purchase_vouchers` → bạn không thấy Phiếu mua hàng (PV gần nhất tenant KOJAVM dừng ở `PM2026-00007` ngày 27/5).
2. Sau đó bạn bấm Bỏ qua 3 lần (đó là các toast "Đã bỏ qua" trong session replay).

## Nguyên nhân

Trong `src/lib/inbox-ai.functions.ts` (`approveInboxItem`, dòng ~1439):

```ts
} else if (docMeta?.doc_kind === "purchase_invoice") {
  const pvId = await materializePurchaseVoucherFromDocument(...)
```

Nhánh tạo PV chỉ chạy khi `documents.doc_kind === "purchase_invoice"`. Document `8f085f9d` lại có `doc_kind = "other"` mặc dù `ocr_extracted.direction = "purchase_invoice"` và `_einvoice.seller = TUYỀN HƯNG PHÚ` rất rõ ràng.

Nguyên nhân gốc: **mỗi XML hoá đơn đang được lưu 2 row `documents`** cùng `original_filename`, cách nhau 2 giây. Row sau được pipeline einvoice parse → `doc_kind=purchase_invoice`. Row trước (`other`) là phần upload thô chưa qua bước classify. Inbox lại hiển thị cả hai → bạn bấm nhầm row "other".

Bằng chứng (cùng tenant KOJAVM, gần nhất):

| filename | `8f085f9d` (other) | `cd95008b` (purchase_invoice) |
|---|---|---|
| `1C26TYY_00002847.xml` | doc_kind=other ❌ | doc_kind=purchase_invoice ✅ |
| `1C26TSG_0000384...xml` (HASFARM) | other ❌ | purchase_invoice ✅ |
| `1C26TTB_00000094.xml` (TẤM BAKERY) | other ❌ | purchase_invoice ✅ |

## Thay đổi

### 1. Nới điều kiện tạo Phiếu mua hàng — `src/lib/inbox-ai.functions.ts`

Trong `approveInboxItem`:
- Lấy thêm `ocr_extracted` cùng `doc_kind` từ `documents`.
- Coi là HĐ mua khi **bất kỳ** điều kiện sau đúng:
  - `doc_kind === "purchase_invoice"`, **hoặc**
  - `ocr_extracted.direction === "purchase_invoice"`, **hoặc**
  - tồn tại `ocr_extracted._einvoice.seller.tax_id` và `buyer.tax_id` trùng MST tenant.
- Nếu rơi vào nhánh này mà `doc_kind !== "purchase_invoice"` → `UPDATE documents SET doc_kind='purchase_invoice'` rồi mới `materializePurchaseVoucherFromDocument(...)`.

Cùng logic đối ứng cho `sales_invoice` (`direction === "sales_invoice"` hoặc `_einvoice.seller.tax_id === tenantTaxId`) để chống tái phát phía bán.

### 2. Vá dữ liệu cho document đang lỗi

Server function nhỏ `backfillMissingPurchaseVoucher({ journal_entry_id })` (kèm middleware auth, kiểm tra tenant):
- Tìm document gốc của entry qua `inbox_decisions.item_external_id`.
- Nếu chưa có `purchase_vouchers` nào tham chiếu `journal_entry_id` này → chạy `materializePurchaseVoucherFromDocument(...)` với cùng `entry_date` & `journalEntryId`.

Chạy 1 lần cho entry `0c1303ce-e17b-4017-b98b-8aae83eccefd` để tạo phiếu PM2026-00008 cho TUYỀN HƯNG PHÚ (không tạo bút toán mới, chỉ link phiếu vào entry sẵn có).

### 3. Chống tạo trùng document khi upload XML

Vấn đề phụ nhưng là gốc rễ tái phát. Trong nhánh upload XML einvoice (file `src/lib/einvoices*.ts` / pipeline upload):
- Trước khi `insert documents`, kiểm tra `(tenant_id, storage_path)` hoặc `(tenant_id, original_filename, checksum_sha256)` đã tồn tại chưa → nếu có thì `UPDATE` row hiện hữu thay vì insert mới.
- Thêm unique index DB: `CREATE UNIQUE INDEX documents_xml_dedup_idx ON documents(tenant_id, storage_path) WHERE storage_path IS NOT NULL` để chặn ở tầng DB.

### 4. UI Inbox: ẩn document "other" khi đã có bản purchase_invoice cùng filename

Trong `src/routes/_app/inbox.tsx` / loader inbox items: dedup theo `(tenant_id, original_filename)` — ưu tiên row có `doc_kind ∈ {purchase_invoice, sales_invoice}` và bỏ qua row `other` cùng tên. Để bạn không bao giờ thấy 2 dòng giống nhau nữa.

## Kiểm chứng sau khi sửa

1. `select count(*) from purchase_vouchers where journal_entry_id='0c1303ce-...'` → 1.
2. Mở `/purchases/vouchers` thấy `PM2026-00008 — TUYỀN HƯNG PHÚ — 5,222,880₫`.
3. Upload lại XML test → chỉ có 1 row `documents`.
4. Approve một HĐ XML mới → toast "Đã ghi sổ" + có phiếu mới trong cùng giây.

## Không đụng tới

- Logic resolve loại hàng / kind chip / suggest accounts (giữ nguyên).
- Không thay đổi cấu trúc bảng `purchase_vouchers` hay `journal_entries`.
- Không thay đổi auth/RLS.
