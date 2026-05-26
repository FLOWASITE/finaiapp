## Mục tiêu
Khi tải tài liệu lên Trung Tâm tài liệu, hệ thống phải **chặn các tài liệu không thuộc về tổ chức đang hoạt động** (tenant), tránh tình trạng kế toán lỡ tải hoá đơn của doanh nghiệp khác vào kho dữ liệu của mình.

Cách xác định: **đối chiếu MST + tên tổ chức** trích xuất từ OCR/XML với **MST + tên** của tenant đang chọn.

---

## Quy tắc đối chiếu

Đối với mỗi tài liệu sau khi `parseFileCore` trả kết quả:

| Loại tài liệu | Bên phải khớp tenant | Trường so sánh |
|---|---|---|
| Hoá đơn mua (`purchase_invoice`) | **Người mua (buyer)** | `buyer.tax_id` / `buyer.name` |
| Hoá đơn bán (`sales_invoice`) | **Người bán (seller)** | `seller.tax_id` / `seller.name` (= `vendor_*` trong schema hiện tại) |
| Sao kê ngân hàng (`bank_statement`) | **Chủ tài khoản** | `account_holder`, `account_holder_tax_id` (nếu có) |
| Phiếu thu/chi tiền mặt, các loại khác | Bỏ qua check (không đủ tín hiệu) | — |

Thuật toán quyết định (ưu tiên giảm dần):

1. **Khớp MST chuẩn hoá** (bỏ ký tự không phải số, bỏ dạng 13 chữ số = 10 chữ số chính + chi nhánh): → **hợp lệ**.
2. **MST khác hoàn toàn** (cả hai bên có MST, không trùng prefix 10 ký tự): → **từ chối cứng (rejected)**.
3. **Thiếu MST một bên, tên khớp ≥ 80%** (so sánh chuẩn hoá: lowercase, bỏ "công ty / cổ phần / tnhh"): → **cảnh báo**, cho phép user giữ lại.
4. **Không có tín hiệu nào** (parse fail / thiếu cả MST lẫn tên): → **cảnh báo nhẹ** ("Không xác định được tổ chức"), cho phép giữ.
5. Tài liệu loại `auto` chưa phân loại được thành 3 nhóm trên: skip check.

XML hoá đơn điện tử đã có logic xác định hướng theo MST (`parse-document.functions.ts:1105–1111`) — sẽ tận dụng & mở rộng.

---

## Hành vi khi tài liệu bị **từ chối**

- File đã upload lên storage → **xoá khỏi storage** (`supabase.storage.remove`) để không lưu dữ liệu của tổ chức khác.
- Row `documents` → `ocr_status = 'rejected'`, lưu `ocr_error = "Không thuộc tổ chức {tên tenant} (MST {tenant_tax_id}). Tài liệu thuộc về MST {found_tax_id} — {found_name}."`.
- Server fn `uploadDocument` trả về `{ ocr_status: 'rejected', rejection: { reason, found_tax_id, found_name, expected_tax_id, expected_name } }`.

## Hành vi khi **cảnh báo**

- Giữ file, `ocr_status = 'done'`, thêm field `tenant_match = 'warn'` + thông điệp.
- UI hiển thị badge vàng "⚠ Có thể không thuộc tổ chức — kiểm tra lại".

## Hành vi khi **hợp lệ**

- Giữ nguyên flow hiện tại. Thêm field `tenant_match = 'ok'`.

---

## Thay đổi cụ thể

### 1. `src/lib/ai/tenant-match.server.ts` (mới)
Helper thuần server:
- `normalizeTaxId(s)`, `normalizeOrgName(s)` (bỏ tiền tố "công ty / cổ phần / tnhh / chi nhánh", lowercase, bỏ dấu).
- `nameSimilarity(a, b)` — Dice/bigram, trả 0..1.
- `getTenantIdentity(supabase, userId)` → `{ tax_id, name, company_name }` (cache nhẹ trong-request).
- `matchDocumentToTenant(parsed, kind, tenant)` → `{ status: 'ok' | 'warn' | 'reject', reason, expected, found }`.

### 2. `src/lib/documents.functions.ts` — `uploadDocument`
Sau khối `parseFileCore` thành công:
```
const match = matchDocumentToTenant(result.parsed, finalKind, tenant);
if (match.status === 'reject') {
  await supabase.storage.from('invoices').remove([path]);
  await supabase.from('documents').update({
    ocr_status: 'rejected', ocr_error: match.reason
  }).eq('id', docId);
  return { id: docId, ocr_status: 'rejected', rejection: match };
}
if (match.status === 'warn') { /* update notes + return tenant_match */ }
```

### 3. `src/lib/ai/parse-document.functions.ts` (PDF/image path)
Áp dụng cùng logic xác định direction từ MST (đã có sẵn cho XML) cho path PDF/image: sau khi LLM trả về `vendor_tax_id` + `buyer_tax_id` (cần bổ sung `buyer_tax_id`, `buyer_name` vào schema OCR purchase invoice), gọi `matchDocumentToTenant` để quyết định `direction` chính xác (mua/bán) hoặc reject.

Thêm 2 field vào schema OCR LLM (`PurchaseInvoiceSchema`):
- `buyer_name: string | null`
- `buyer_tax_id: string | null`

### 4. UI Upload Dialog (`src/routes/_app/documents/index.tsx`)
Trong `FileItem` thêm status mới `rejected`:
- Icon ❌ đỏ + badge "Không thuộc tổ chức".
- Tooltip / dòng phụ: lý do (MST tìm thấy ≠ MST tenant).
- Toast tổng kết: "Đã tải {ok}/{total} • {rejected} bị từ chối (không thuộc tổ chức)".

Hiển thị warning vàng cho `tenant_match = 'warn'`.

### 5. Migration (rất nhỏ)
Không cần migration cứng — `documents.ocr_status` đã có giá trị tự do (text). Nếu enum bị strict → thêm `'rejected'` vào enum. Sẽ kiểm tra & migration nếu cần.

---

## Cảnh báo & ngoại lệ
- **Tenant chưa khai báo MST**: bỏ qua check tax_id, chỉ so sánh tên. Nếu cả MST + tên đều không khai báo → skip toàn bộ + log info.
- **Sao kê ngân hàng**: nhiều ngân hàng VN không in MST chủ tài khoản → chủ yếu so tên + đối chiếu với `bank_accounts.account_holder` của tenant; nếu không khớp cả 2 → warn (không reject cứng vì OCR sao kê hay sai tên).
- **Tài liệu chung như hợp đồng, biên bản** (`contract`, `other`): không check để không cản trở.
- Khi user **đổi tenant đang hoạt động** rồi mở lại tài liệu cũ → chỉ ảnh hưởng upload mới, không re-validate tài liệu đã tồn tại.

---

## Test phải pass
1. Upload HĐ mua có MST buyer = tenant → `ok`.
2. Upload HĐ mua có MST buyer khác tenant → `rejected`, file bị xoá khỏi storage.
3. Upload HĐ bán (XML) seller = tenant → `ok`, doc_kind tự đổi `sales_invoice`.
4. Upload sao kê tên chủ TK ≠ tên tenant, không có MST → `warn` (vẫn lưu).
5. Tenant chưa khai MST → mọi upload đều `ok` (skip), kèm 1 toast nhắc "Hãy cập nhật MST doanh nghiệp để hệ thống lọc tài liệu chính xác hơn".