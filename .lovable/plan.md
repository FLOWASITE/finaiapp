## 1. Backfill PM2026-00008 cho HĐ TUYỀN HƯNG PHÚ

JE đã có: `0c1303ce-e17b-4017-b98b-8aae83eccefd`, tenant `8681d76b…`, ngày `2026-01-26`, 3 dòng (Nợ 156=4.836.000, Nợ 133=386.880, Có 331=5.222.880). Document gốc: `cd95008b…` (`doc_kind=purchase_invoice`), seller MST `0302886602`, HĐ `00002847`. Bảng `suppliers` chưa có nhà cung cấp này.

Thực hiện qua **2 lệnh insert tuần tự** (dùng `supabase--insert`, không cần migration):

### 1.1 Tạo supplier (idempotent)

```sql
INSERT INTO public.suppliers (tenant_id, name, tax_id, email, phone, address, created_by)
SELECT '8681d76b-855b-4142-a699-5eb299070157', 'CÔNG TY TNHH SẢN XUẤT VÀ THƯƠNG MẠI TUYỀN HƯNG PHÚ', '0302886602',
       '', '(028) 6292 3206', '21 Bàu Cát 4, Phường Tân Bình, TP. Hồ Chí Minh',
       (SELECT user_id FROM tenant_members WHERE tenant_id='8681d76b-855b-4142-a699-5eb299070157' LIMIT 1)
WHERE NOT EXISTS (SELECT 1 FROM public.suppliers WHERE tenant_id='8681d76b…' AND tax_id='0302886602');
```

(Nếu schema `suppliers` có cột khác/required khác sẽ kiểm tra bằng `\d suppliers` trước khi chạy, điều chỉnh insert cho khớp.)

### 1.2 Insert purchase_voucher PM2026-00008

```sql
INSERT INTO public.purchase_vouchers (
  user_id, tenant_id, voucher_no, voucher_date,
  supplier_id, supplier_name, supplier_tax_id,
  invoice_no, invoice_date,
  subtotal, vat_rate, vat_amount, total,
  debit_account, credit_account, vat_account,
  payment_method, journal_entry_id, status, posted_at
)
SELECT
  (SELECT created_by FROM journal_entries WHERE id='0c1303ce…'),
  '8681d76b…',
  'PM2026-00008',
  '2026-01-26',
  s.id, s.name, s.tax_id,
  '00002847', '2026-01-26',
  4836000, 8.00, 386880, 5222880,
  '156', '331', '1331',
  'credit', '0c1303ce…', 'posted', now()
FROM public.suppliers s
WHERE s.tenant_id='8681d76b…' AND s.tax_id='0302886602';
```

Cuối cùng UPDATE `documents.purchase_voucher_id` (nếu cột tồn tại) hoặc bỏ qua nếu không có cột liên kết — chỉ cần PM2026-00008 hiện trong danh sách phiếu mua và trỏ về JE đúng.

QA: `SELECT voucher_no, invoice_no, supplier_name, journal_entry_id FROM purchase_vouchers WHERE voucher_no='PM2026-00008'`.

## 2. Dedup inbox: ẩn `doc_kind=other` khi đã có sibling

Bug đã xác nhận: 2 row cùng `ai_upload_id='eb49ec1b…'`, một row `purchase_invoice` (cd95008b…), một row `other` (8f085f9d…). Hôm qua KTV bấm vào row `other` rồi nhỡ tay → Skip.

### Sửa server side (1 chỗ duy nhất)

`src/lib/inbox-ai.functions.ts` — trong `listInboxAi` (~ dòng 1255):

1. Thêm `ai_upload_id` vào select của `docsRes`:
   ```ts
   .select("id, original_filename, doc_kind, ocr_status, ocr_extracted, source, created_at, invoice_id, ai_upload_id")
   ```
2. Sau khi `docsRes` resolve, lọc trước khi đưa vào vòng `for (const d of docsRes.data)`:
   ```ts
   const classifiedKinds = new Set(["purchase_invoice", "sales_invoice"]);
   const groups = new Map<string, any[]>();
   for (const d of (docsRes.data ?? []) as any[]) {
     const key = d.ai_upload_id ?? `__solo_${d.id}`;
     (groups.get(key) ?? groups.set(key, []).get(key)!).push(d);
   }
   const filteredDocs: any[] = [];
   for (const [, arr] of groups) {
     const classified = arr.filter((d) => classifiedKinds.has(d.doc_kind));
     filteredDocs.push(...(classified.length > 0 ? classified : arr));
   }
   ```
3. Dùng `filteredDocs` thay cho `docsRes.data` ở các bước tiếp theo (build `invoiceIds`, vòng `for (const d of …)` tạo `items`).

Tác động: khi 1 ai_upload_id đã có row được phân loại đúng (`purchase_invoice`/`sales_invoice`), row `other` cùng nhóm bị ẩn khỏi Inbox — KTV không còn chỗ bấm nhầm. Tất cả luồng khác (Documents page, AI parse, Skip cũ) giữ nguyên.

## Ngoài phạm vi

- Không sửa pipeline upload XML để chống tạo 2 row (đã đề cập trong plan trước — chưa làm vì cần điều tra thêm).
- Không phục hồi item đã Skip cho các doc khác — chỉ backfill PM2026-00008.
- Không đổi luồng approve / posting / RLS / weight calibration.

## Thứ tự thực hiện

1. `supabase--insert`: tạo supplier (nếu chưa có) + voucher PM2026-00008.
2. Đọc lại DB xác nhận voucher xuất hiện.
3. Sửa `listInboxAi` (dedup theo `ai_upload_id`).
4. Mở Inbox, xác nhận chỉ còn 1 row cho mỗi XML.
