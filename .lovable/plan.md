## Mục tiêu

1. **Truy vết tại sao file thứ 2 không có trong Storage** (đã có 1 file `Sao ke MB bank_1.pdf`, không có file thứ 2).
2. **Đảm bảo file gốc luôn được lưu vào Storage** ngay cả khi parse fail, cache hit, hoặc bị auto-skip do trùng hash.

## Phân tích nguyên nhân hiện tại

Trong `src/lib/ai/parse-document.functions.ts`, hàm `parseFileCore` lưu file vào bucket `invoices` **chỉ ở bước 6** (cuối hàm), nên file gốc bị bỏ qua trong các trường hợp:

- **Cache hit** (bước 0): return sớm, không upload.
- **Parse fail** (LlamaParse/OCR throw): exception bubble lên, không tới bước 6.
- **Auto-skip trong UI** (`isFileDup` ở composer): file đã có trong `ai_uploads` (theo `file_hash`) thì bị set action `"skip"`; nhưng trong session hiện tại nếu là file MỚI mà trùng hash với file đã upload trước thì OK — nhưng nếu file 2 trùng hash file 1 thì cache hit khiến không upload.

Bản chất: 1 trong 2 file của bạn có thể đã trùng hash với file đã upload (cache hit) HOẶC parse fail trước bước 6.

## Triển khai

### 1. Refactor `parseFileCore` — upload file gốc TRƯỚC khi parse

Tách bước 6 hiện tại thành **bước 0.5**: ngay sau khi tính `fileHash`, upload file lên Storage và insert một row "khung" vào `ai_uploads`. Các bước parse sau đó chỉ UPDATE row đó với `parsed`, `parser_used`, `pages`, `error` (nếu fail).

```text
0. fileHash = sha256(file)
0.5. Upsert ai_uploads theo (user_id, file_hash, kind):
     - Nếu chưa có: upload file lên Storage, insert row với status='uploaded'
     - Nếu đã có: dùng lại row + file_path cũ (tránh duplicate storage objects)
1. Cache check → nếu hit: UPDATE row với parsed từ cache, return
2-5. Parse như cũ
6. UPDATE row với parsed/parser_used/pages
   Nếu throw: catch → UPDATE row với error=<message>, rồi rethrow
```

Lợi ích:
- File gốc **luôn có mặt** trong Storage ngay khi user attach, bất kể parse có thành công hay không.
- Có audit trail cho file fail (xem được `error` trong `ai_uploads`).
- Cache hit vẫn có row trỏ tới file gốc (file_path đầy đủ).

### 2. Schema thay đổi (migration nhỏ)

Bảng `ai_uploads` cần:
- Index unique `(user_id, file_hash, kind)` để upsert idempotent.
- Cột `status text default 'parsing'` (giá trị: `uploaded`, `parsing`, `parsed`, `failed`).

Nếu bảng đã có dữ liệu trùng `(user_id, file_hash, kind)` thì migration sẽ DEDUPLICATE trước (giữ row cũ nhất), rồi thêm unique index.

### 3. Hiển thị link file gốc trong UI Classifying

Trong `parse-progress-dialog.tsx`, mỗi `ClassifyRow` hiện tại chỉ hiện tên file. Thêm:
- Icon link "Xem file gốc" → mở signed URL của file trong Storage (gọi `supabase.storage.from('invoices').createSignedUrl(...)`).
- Áp dụng cho cả file OK lẫn file fail/skip để user có thể tự kiểm tra.

### 4. Server function mới: `getUploadSignedUrl`

`src/lib/ai/parse-document.functions.ts` thêm:
```ts
getUploadSignedUrl({ uploadId }): { url: string }
```
Dùng `requireSupabaseAuth`, validate `uploadId` thuộc về user, trả về signed URL 1 giờ.

### 5. Truy vết file thứ 2

Sau khi deploy, để bạn kiểm tra file thứ 2:
- Mở DevTools → Network tab, attach lại 2 file, xem response của `parseDocument` cho từng file.
- Hoặc query: `SELECT filename, file_hash, status, error FROM ai_uploads ORDER BY created_at DESC LIMIT 5;` — sẽ thấy file thứ 2 với status/error rõ ràng.

## Files thay đổi

- `supabase/migrations/<ts>_ai_uploads_dedupe_index.sql` — unique index + cột `status`.
- `src/lib/ai/parse-document.functions.ts` — refactor `parseFileCore` (upload trước, update sau), thêm `getUploadSignedUrl` server function.
- `src/components/chat/parse-progress-dialog.tsx` — nút "Xem file gốc" trên mỗi row classify, truyền `uploadId` từ kết quả parse.
- `src/components/chat/composer.tsx` — giữ `uploadId` của từng item parsed để pass xuống dialog.

## Không đổi

- Bucket `invoices` (private) giữ nguyên — vẫn dùng signed URL.
- RLS của `ai_uploads` không đổi.
- Logic auto-skip duplicate giữ nguyên (chỉ thêm link xem file gốc).
