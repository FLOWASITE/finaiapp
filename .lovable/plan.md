
# Stage 2 — Lifecycle XML/PDF (phần còn lại)

Làm gộp 3 hạng mục: chuẩn hoá `storage_path` → cron nén/archive → helper signed URL có auto-decompress.

---

## 1. Chuẩn hoá `storage_path` (2.1)

**Layout mới**: `{tenant_id}/{year}/{month}/{invoice_id}/{kind}.{ext}`
- `kind` ∈ `xml | pdf | signed_xml`
- `ext` giữ nguyên gốc; nếu đã nén thêm `.gz`

**Cách triển khai (không re-upload file cũ)**:
- Thêm cột `documents.canonical_path text` — path chuẩn dùng cho file mới upload từ giờ.
- File cũ giữ `storage_path` hiện tại (`{user_id}/xml/timestamp-name.xml`); helper đọc bucket + path từ `storage_path` như cũ.
- Cập nhật `einvoice-xml.functions.ts` (và các nơi upload XML/PDF khác) để dùng layout mới khi `tenant_id` + `invoice_id` đã có.
- Khi cron archive đụng vào file cũ, nó sẽ ghi `canonical_path` mới + di chuyển sang bucket archive theo layout chuẩn (lazy migration).

Lý do: tránh down-time + tránh 1 migration nặng đụng vài chục nghìn object.

---

## 2. Cron nén & archive (2.3)

**Server route**: `src/routes/api/public/hooks/archive-documents.ts` (POST, không cần auth vì `/api/public/*`; verify bằng `apikey` header = anon key).

Xử lý theo batch (mặc định 50 doc/lần để tránh time-out Worker):

1. **Warm tier** (12–60 tháng tuổi, `storage_tier='hot'`, `compressed=false`, XML):
   - Download từ `invoices` bucket
   - gzip (Node `zlib`)
   - Upload `.gz` cùng path mới (layout chuẩn), set `storage_tier='warm'`, `compressed=true`, cập nhật `storage_path` + `canonical_path`
   - Xoá object gốc
2. **Archive tier** (> 60 tháng, `storage_tier in ('hot','warm')`):
   - Copy sang bucket `einvoices-archive` theo layout chuẩn (giữ `.gz` nếu đã có; nén nếu chưa)
   - Set `storage_tier='archived'`, `archived_at=now()`, cập nhật `storage_path`
   - Xoá object ở bucket nguồn

PDF chỉ archive (không nén — đã nén sẵn).

**Schedule** (qua `supabase--insert`, không phải migration):
- Weekly Chủ nhật 02:00 ICT (`0 19 * * 6` UTC)
- Body `{}`; route tự lấy batch 50.

**Idempotent**: query lọc theo `storage_tier` + `archived_at IS NULL` để chạy lại không hỏng dữ liệu.

---

## 3. Helper `get_document_url(doc_id)` (2.4)

**File**: `src/lib/documents.functions.ts`

```ts
export const getDocumentUrl = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ docId: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    // 1. Load document (RLS scoped to user)
    // 2. Cập nhật last_accessed_at qua RPC mark_document_accessed
    // 3. Nếu compressed=false → trả signed URL 5 phút từ bucket gốc
    // 4. Nếu compressed=true:
    //    - Download .gz → gunzip → upload bản tạm vào bucket `invoices`
    //      path: `_tmp/{userId}/{docId}-{nonce}.xml` (TTL ngắn)
    //    - Trả signed URL 5 phút của bản tạm
    //    - File tạm sẽ bị job đêm dọn (xem dưới)
    // 5. Nếu storage_tier='archived' → cùng flow như (4) nhưng đọc từ bucket
    //    `einvoices-archive` (dùng supabaseAdmin vì bucket private RLS phức tạp,
    //    đã verify ownership ở bước 1).
  });
```

**Dọn temp file**: thêm vào cùng cron archive một bước xoá object `_tmp/*` cũ > 1h.

UI hiện tại (invoice viewer, link XML) đổi từ `createSignedUrl` trực tiếp sang gọi `getDocumentUrl` — chỉ 1–2 chỗ.

---

## Files

**Tạo mới**
- `src/routes/api/public/hooks/archive-documents.ts`
- `src/lib/documents.functions.ts`
- 1 migration: thêm cột `documents.canonical_path`, index `(storage_tier, issue_date)` cho cron

**Sửa**
- `src/lib/einvoice-xml.functions.ts` — dùng layout path mới khi upload
- 1–2 chỗ đang gọi `supabase.storage.from('invoices').createSignedUrl(...)` cho documents → đổi sang `getDocumentUrl`

**SQL (qua insert tool, không phải migration)**
- `cron.schedule('archive-documents-weekly', ...)` gọi `/api/public/hooks/archive-documents`

---

## Bỏ qua / để sau
- Re-upload toàn bộ file cũ về layout mới (lazy migration đủ).
- Re-encrypt / KMS cho bucket archive.
- UI hiển thị tier badge trong list invoice (mục riêng trong roadmap).

OK chốt thì em vào build mode triển khai.
