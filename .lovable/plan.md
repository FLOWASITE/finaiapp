
# Phân loại file thông minh khi upload

## Vấn đề hiện tại
`src/lib/ai/bulk-intake.server.ts` chỉ dựa **tên file + mime** (regex `hd_`, `saoke_`...) để phân loại. Hệ quả:
- File tên chung chung như `scan_001.pdf`, `document.pdf` → mặc định gán `purchase_invoice` (HĐ vào) dù có thể là HĐ ra / phiếu giao hàng / hợp đồng.
- Không phân biệt được HĐ vào vs HĐ ra khi tên file không có gợi ý.
- Sao kê PDF không có chữ "saoke" trong tên → bị nhận nhầm là hoá đơn.
- File rác (hợp đồng, biên bản, ảnh chụp màn hình) vẫn lọt vào auto-post.

## Mục tiêu
Khi user upload nhiều file, hệ thống cần **đọc nội dung thực tế** để phân vào đúng nhóm:
1. `purchase_invoice` — HĐ đầu vào (NCC bán cho ta)
2. `sales_invoice` — HĐ đầu ra (ta bán cho khách) 
3. `bank_statement` — Sao kê ngân hàng
4. `cash_voucher` — Phiếu thu/chi
5. `other` — Không liên quan (hợp đồng, biên bản, ảnh rác...) → bỏ qua, không tốn token parse đầy đủ

## Hướng triển khai

### 1. Thêm "lớp phân loại nhanh" (quick classify) bằng AI gateway
File mới: `src/lib/ai/classify-file.server.ts`
- Input: 1 file (PDF/XLSX/ảnh)
- Trích xuất **khoảng 1-2 trang đầu** (dùng `pdf-text.server.ts` đã có) hoặc base64 ảnh ~500KB cho image.
- Gọi **google/gemini-3.5-flash** (rẻ, nhanh) với prompt:
  - "Đây là loại chứng từ kế toán Việt Nam nào?"
  - Trả về JSON schema: `{ kind: "purchase_invoice"|"sales_invoice"|"bank_statement"|"cash_voucher"|"other", confidence: 0..1, reason: string, seller_tax_id?, buyer_tax_id? }`
- Có MST bên bán + MST bên mua → so với `tenants.tax_id` của tenant đang active để quyết định **vào hay ra**:
  - `buyer_tax_id == tenant.tax_id` → `purchase_invoice`
  - `seller_tax_id == tenant.tax_id` → `sales_invoice`

### 2. Cập nhật `bulk-intake.server.ts`
- Sau bước `ensureUploadQuick`, gọi `classifyFile` song song (Promise.all với concurrency 4) cho các file mime PDF/ảnh/Excel.
- Ưu tiên kết quả AI > regex tên file:
  - AI `confidence >= 0.85` → dùng kết quả AI, set `bucket = "auto"` (riêng `sales_invoice` và `other` luôn `bucket = "review"`/`"ask"`).
  - AI `0.5..0.85` → giữ kind nhưng `bucket = "review"`.
  - AI fail / `confidence < 0.5` → fallback regex hiện tại.
- File `kind: "other"` → KHÔNG bỏ vào `items` để xử lý auto; đẩy vào nhóm `groupCounts.other` và `bucket: "ask"` với reason rõ.

### 3. Thêm group mới `sales_invoice` đúng nghĩa
- Hiện tại `sales_invoice` group có nhưng kind vẫn map sang `purchase_invoice` (dòng 64-71). Sửa để khi xác định là HĐ ra thật sự thì:
  - `kind = "auto"` (chưa có flow post HĐ ra qua bulk-run → giữ `bucket = "review"`, reason: "Hoá đơn đầu ra — chưa hỗ trợ tự động ghi sổ, mở để xem").
- Hoặc tạo placeholder rõ ràng để future wire vào `sales.functions.ts`.

### 4. Cache phân loại theo `file_hash`
- Thêm cột (hoặc dùng cột sẵn `ai_uploads.kind` + cột mới `classify_meta jsonb`) để khi user upload lại file đã từng phân loại → đọc từ cache, không gọi AI lại.
- Migration nhỏ:
  ```sql
  ALTER TABLE ai_uploads ADD COLUMN IF NOT EXISTS classify_meta jsonb;
  ```

### 5. UI — hiển thị kết quả phân loại rõ hơn
`src/components/chat/bulk/bulk-intake-card.tsx` (đọc qua `BulkPlan`):
- Bảng intake đã có cột group; thêm badge confidence + lý do AI (`reason` đã có).
- Nhóm "Không liên quan" có nút **"Bỏ qua tất cả"** / **"Xem từng file"**.
- Hoá đơn đầu ra hiện riêng nhóm với note "Sẽ mở trang Bán hàng để xử lý thủ công".

## Phạm vi không làm trong lần này
- Không thay đổi flow parse chi tiết của từng kind (vẫn dùng `parseDocument` hiện tại sau khi đã phân loại).
- Không thêm flow auto-post cho HĐ đầu ra (cần thiết kế riêng).
- Không OCR ảnh nâng cao — vẫn dựa Gemini multimodal.

## Chi phí ước tính
- ~1 call Gemini Flash / file ≈ <500 tokens input + 100 output → rất rẻ (~$0.0002/file).
- Cache theo `file_hash` → upload lại không tốn.

## Câu hỏi cần xác nhận
1. Với file `other` (hợp đồng, biên bản...), bạn muốn: **(a)** lưu vào `ai_uploads` nhưng không tạo chứng từ và hiện ở "Cần xem", hay **(b)** xoá hẳn khỏi storage để tiết kiệm?
2. Khi nhận diện HĐ đầu ra, có muốn tôi tự động đẩy sang flow tạo nháp HĐ bán hàng (cần backend mới) hay tạm thời chỉ hiển thị link mở trang Bán hàng để user xử lý thủ công?
