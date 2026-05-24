## Mục tiêu

Khi user upload hóa đơn mua vào (PDF/ảnh/XML), AI tự động **phân loại từng dòng** thành 1 trong 3 nhóm và gợi ý tài khoản hạch toán:

| Nhóm | TK gợi ý | Ví dụ |
|---|---|---|
| **Hàng hóa / NVL / CCDC** | 156, 152, 153 | Bia, gạo, văn phòng phẩm |
| **Tài sản cố định** | 211, 213 | Máy tính > 30tr, ô tô, phần mềm bản quyền |
| **Dịch vụ / Chi phí** | 627, 641, 642 | Phí vận chuyển, tiền điện, tư vấn |

Kèm **độ tin cậy (0-100%)**: ≥ 80% auto-fill, < 80% hỏi user và **ghi nhớ** quyết định.

## Cơ chế phân loại (rules + AI)

Mỗi dòng hóa đơn được chấm điểm theo 5 tín hiệu, tổng hợp ra `kind` + `confidence`:

1. **Đơn giá** (trọng số 30%)
   - ≥ 30,000,000 VND/đơn vị → +mạnh TSCĐ
   - < 30tr nhưng ≥ 3tr + ĐVT đếm được → +CCDC (153)
2. **Đơn vị tính** (20%)
   - kg, hộp, thùng, chai, lon → Hàng hóa
   - cái, bộ, chiếc → CCDC/TSCĐ (kết hợp giá)
   - lần, gói, tháng, kỳ, dịch vụ → Dịch vụ
3. **Từ khóa tên hàng** (25%) — keyword dictionary tiếng Việt
   - TSCĐ: "máy", "thiết bị", "xe", "ô tô", "phần mềm bản quyền", "hệ thống"
   - Dịch vụ: "phí", "cước", "dịch vụ", "tư vấn", "thuê", "bảo trì", "vận chuyển"
   - Hàng hóa: có mã SKU/barcode, tên SP cụ thể
4. **Ngành nghề NCC** (15%) — lookup từ `suppliers.industry` / VSIC
   - NCC vận tải/viễn thông/tư vấn → mặc định Dịch vụ
   - NCC phân phối/siêu thị → Hàng hóa
5. **Lịch sử với NCC này** (10%) — query `invoices` 12 tháng qua: nếu ≥ 70% dòng cùng NCC từng được phân loại 1 kind → +điểm cho kind đó

→ AI gateway (google/gemini-3-flash-preview) là **fallback** khi rule không đủ confidence: gửi prompt chứa toàn bộ dòng + context NCC, model trả về JSON `{kind, account, confidence, reason}`.

## Thay đổi cụ thể

### 1. Backend logic

**File mới: `src/lib/ai/classify-line.server.ts`**
- `classifyLine(line, supplier, history) → { kind: 'goods'|'fixed_asset'|'ccdc'|'service', account: string, confidence: number, signals: Signal[] }`
- Triển khai 5 rule trên + gọi AI gateway khi confidence < 60%.

**Cập nhật: `src/lib/ai/parse-document.functions.ts`**
- Sau khi parse OCR/XML thành các dòng, chạy `classifyLine` cho từng dòng song song.
- Trả thêm field `classification` cho mỗi line: `{ kind, account, confidence, signals }`.

**Cập nhật: `src/lib/import-preview.functions.ts`**
- Mở rộng `lookupSupplierByTaxId` trả thêm `industry` và `recent_kind_distribution` (đếm theo kind trong 12 tháng).

**Cập nhật: `src/lib/ai/inbox-reason.server.ts`**
- Khi build `documentItem`, đọc `classification` từ parsed data và đưa vào `proposal.lines` (auto chọn account 156/211/642 thay vì để trống).

### 2. UI hiển thị

**Cập nhật: `src/components/chat/invoice/invoice-extract-card.tsx`** và **`journal-proposal-card.tsx`**
- Mỗi dòng hiển thị **badge phân loại** với màu:
  - 🟢 Hàng hóa (xanh lá) / 🔵 TSCĐ (xanh dương) / 🟡 Dịch vụ (vàng) / 🟣 CCDC (tím)
- Tooltip hiển thị các `signals` đã dùng (ví dụ: "Đơn giá 45tr → TSCĐ", "NCC ngành vận tải → Dịch vụ").
- Nếu confidence < 80% → viền vàng + dropdown cho user chọn lại kind.

### 3. Ghi nhớ quyết định

**DB migration mới** (sẽ chạy ở bước build):
- Bảng `ai_line_classifications` lưu mapping `(tenant_id, supplier_id, line_name_normalized) → kind, account` mỗi khi user xác nhận/sửa.
- Lần sau gặp dòng tương tự (fuzzy match similarity ≥ 0.85) → áp dụng luôn, confidence = 100%.

### 4. Cấu hình ngưỡng

**File: `src/lib/ai/classify-config.ts`** — user (admin) có thể chỉnh:
- `auto_apply_threshold` (mặc định 80)
- `fixed_asset_min_value` (mặc định 30,000,000 — theo Thông tư 45/2013)
- `ccdc_min_value` (mặc định 3,000,000)

## Phạm vi KHÔNG thuộc plan này

- Khớp mặt hàng với danh mục kho (fuzzy/embedding) — câu hỏi 2, ship sau.
- Nhận diện hóa đơn tiếp khách — câu hỏi 3, ship sau.
- Tự tạo item mới trong kho khi gặp tên lạ — ship sau.

## Tiêu chí hoàn thành

1. Upload 1 PDF hóa đơn mua máy tính (45tr) → AI gắn badge **TSCĐ**, account `211`, confidence ≥ 85%.
2. Upload hóa đơn cước viễn thông Viettel → AI gắn badge **Dịch vụ**, account `6427`, confidence ≥ 90% (do industry + keyword "cước").
3. Upload hóa đơn mua 10 thùng bia → AI gắn badge **Hàng hóa**, account `156`.
4. Confidence < 80% → UI hiện dropdown cho user chọn lại; sau khi user chọn, lần sau gặp NCC + tên hàng tương tự thì auto đúng.
