
# Xử lý tên mặt hàng dài trên hóa đơn

## Vấn đề

Hóa đơn ghi: `Cước vận chuyển ngày 28/01/2026 HCM-HN Xe 50H-897.69`

Phần thực sự là **mặt hàng/dịch vụ** chỉ là `Cước vận chuyển`. Phần còn lại là **metadata chuyến** (ngày, tuyến, biển số) — không nên đi vào tên SP, nhưng PHẢI giữ lại để:
- Đối soát chuyến/lệnh điều xe
- Giải trình thuế khi cần
- Tìm kiếm lại sau này

Nếu để nguyên cả chuỗi làm `raw_name`:
- Fuzzy match với product catalog hỏng (mỗi hóa đơn 1 tên khác → không bao giờ cache rule được)
- `classifyRoute` vẫn chạy được (đã có "vận chuyển" trong CLEAR_SERVICE_PATTERNS) nhưng resolve mặt hàng thì không tái sử dụng
- UI hiển thị dài, rối

## Hướng giải quyết

Tách **canonical_name** (tên ngắn, ổn định) ra khỏi **line_note** (metadata chuyến/lô/serial), giữ `raw_name` gốc để audit.

```text
raw_name        : "Cước vận chuyển ngày 28/01/2026 HCM-HN Xe 50H-897.69"
canonical_name  : "Cước vận chuyển"                    ← dùng để match catalog + cache rule
line_note       : "28/01/2026 · HCM-HN · Xe 50H-897.69" ← lưu kèm dòng phiếu, không match
```

### 1. Trích xuất tự động (server-side, ở `resolveInvoiceLines` / extract)

Thêm `splitItemName(rawName)` chạy trước fuzzy match. Quy tắc tách theo thứ tự ưu tiên (regex trên `rawName`, không phá NFD):

| Pattern | Ví dụ tách ra note |
|---|---|
| Ngày: `\d{1,2}[/-]\d{1,2}([/-]\d{2,4})?` | `28/01/2026` |
| Khoảng ngày: `... đến ...`, `từ ... đến ...` | `từ 01/01 đến 31/01` |
| Biển số xe VN: `\d{2}[A-Z]{1,2}-?\d{3}\.?\d{2}` | `50H-897.69`, `72B-001.79` |
| Số HĐ/lệnh: `số\s*[:#]?\s*\w+`, `LĐX\w+`, `BL\w+` | `Số 123` |
| Tuyến: cụm 2 địa danh nối bằng `-`, `→`, `đến` (HCM, HN, ĐN…) | `HCM-HN` |
| Tháng/kỳ: `tháng\s*\d+(/\d{2,4})?`, `kỳ \d+` | `tháng 01/2026` |
| Serial/IMEI/SN: `S/?N[:\s]\w+`, `IMEI[:\s]\d+` | `SN ABC123` |
| Cụm trong ngoặc `(...)`, `[...]` cuối chuỗi | nội dung trong ngoặc |

Output:
```ts
{ canonical_name: string, note_parts: string[], raw_name: string }
```

`canonical_name` = `rawName` sau khi xoá các match, normalize whitespace, trim các từ nối thừa (`ngày`, `số`, `xe`, `tuyến`, `từ`, `đến`). Nếu kết quả ngắn < 3 ký tự hoặc rỗng → fallback giữ nguyên `rawName` (an toàn).

`line_note` = `note_parts.join(' · ')`.

### 2. Schema

Không thêm bảng. Thêm cột nullable trên dòng phiếu (`purchase_voucher_lines`):
- `raw_name text` (đã có / giữ)
- `line_note text null` — note tách tự động hoặc user gõ thêm

Không lưu `canonical_name` riêng — nó chỉ là input cho matcher. Sau khi match xong, dòng phiếu trỏ về `product_id` (nguồn chân lý cho tên ngắn).

Trường hợp **tạo SP mới** (Loại "new" trong `ItemResolutionPanel`): prefill `name` = `canonical_name` thay vì `raw_name`. Hiện `NewProductForm` đang prefill `props.rawName` → đổi thành `canonical_name`.

### 3. UI (`item-resolution-panel.tsx`)

Trong mỗi row, hiển thị 2 dòng:
```text
Cước vận chuyển                          ← font-medium (canonical_name)
28/01/2026 · HCM-HN · Xe 50H-897.69      ← text-[10px] text-muted (line_note, có thể edit)
```

- Nếu chuỗi không tách được gì → chỉ hiện 1 dòng như cũ.
- Cho phép user click vào line_note để chỉnh tay (inline edit), lưu vào `purchase_voucher_lines.line_note`.
- Trong popover "khớp mã": **chỉ** truyền `canonical_name` vào `resolveInvoiceLines` và `confirmItemMapping` (cache rule), để lần sau cùng NCC + cùng "Cước vận chuyển" tự khớp bất kể chuyến nào.

### 4. Tác động lên các hệ thống đang có

- **`classifyRoute` (route-line.ts):** đã `normalizeName` toàn chuỗi, vẫn match "vận chuyển" bình thường. **Không cần đổi.**
- **`suggestPurchasePurpose`:** không đổi — vẫn nhận `description + itemNames` đầy đủ, vì purpose-picker cần ngữ cảnh rộng.
- **Cache rule `supplier_item_mappings`:** key là `(supplier_id, raw_name)`. Đổi thành lưu theo `canonical_name` để rule tái sử dụng được. **Đây là thay đổi hành vi** — rule cũ vẫn match được nhờ `raw_name` còn nguyên trong DB; rule mới ghi `canonical_name` (cùng cột `raw_name` của bảng mappings nhưng giá trị đã tách).
- **`ItemResolutionPanel.payloadLines`:** thêm bước `splitItemName` trước khi build payload; truyền cả `canonical_name` + `line_note` xuống server.

### 5. Test fixtures cần thêm (`__tests__/split-item-name.test.ts`)

```text
"Cước vận chuyển ngày 28/01/2026 HCM-HN Xe 50H-897.69"
  → canonical: "Cước vận chuyển", note: "28/01/2026 · HCM-HN · Xe 50H-897.69"

"Tiền điện kỳ tháng 01/2026"
  → canonical: "Tiền điện", note: "kỳ tháng 01/2026"

"Bia Tiger lon 330ml (thùng 24)"          ← KHÔNG tách "(thùng 24)" vì là quy cách SP
  → canonical: "Bia Tiger lon 330ml (thùng 24)", note: ""

"Dịch vụ tư vấn"                           ← ngắn, không có metadata
  → canonical: "Dịch vụ tư vấn", note: ""

"Vận chuyển HN-HCM xe 29C-12345 ngày 15/3"
  → canonical: "Vận chuyển", note: "HN-HCM · 29C-12345 · 15/3"
```

Edge case: cụm `(thùng 24)`, `(hộp 12)`, `(set 5)` là **quy cách**, KHÔNG phải metadata chuyến → whitelist không tách ngoặc khi nội dung match `(thùng|hộp|set|combo|pack|gói|chai|lon)\s*\d+`.

## Phạm vi triển khai

**Trong scope:**
1. `src/lib/items/split-item-name.ts` (mới) — `splitItemName(raw)` + test fixtures
2. `src/lib/items/mappings.functions.ts` — `resolveInvoiceLines` chạy `splitItemName` trên từng line, dùng `canonical_name` để fuzzy match, trả thêm `canonical_name` + `line_note` về client
3. `src/components/inbox/item-resolution-panel.tsx` — hiển thị 2 dòng, prefill `NewProductForm.name` bằng `canonical_name`
4. Migration: thêm cột `line_note text null` vào `purchase_voucher_lines` (+ GRANT)
5. Khi tạo voucher từ inbox → lưu `line_note` vào DB

**Ngoài scope (đề xuất sau):**
- Cho user kéo-thả token giữa canonical và note
- Học từ chỉnh tay của user → cải thiện regex
- Áp dụng tương tự cho hóa đơn bán ra
