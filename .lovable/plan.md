
# Kế hoạch: Đối chiếu mặt hàng NCC ↔ Master Data (Vendor Item Reconciliation)

Mục tiêu: khi hóa đơn mua về, Fin tự resolve `raw_name` từ NCC sang mã chuẩn trong master data của DN (`products`), với 4 lớp ưu tiên — cached → fuzzy multi-signal → LLM → human confirm. Mỗi lần KTV xác nhận = thêm một "memory" để lần sau auto.

Tình trạng hiện tại (đã đọc DB):
- Đã có `products` (master data đầy đủ: code, name, unit, item_type 152/153/156…, default accounts).
- Đã có `tenant_product_catalog` (chỉ là từ điển tên + alias, không gắn với supplier).
- Đã có `suppliers`, `product_unit_conversions`.
- **Chưa có** bảng mapping (NCC × raw_name → product) và **chưa có** audit log resolve.

## Phạm vi & không trong phạm vi

Trong phạm vi (MVP đợt này):
- Lớp 1 (cached lookup) + Lớp 2 (multi-signal scoring, có/không embedding) + Lớp 4 (UX confirm trong Inbox).
- Unit conversion factor (case #1 — quan trọng nhất).
- Hỗ trợ case "tạo mã mới 1-click" (case #6).
- Audit log mọi quyết định.

V2 / sau MVP — chỉ thiết kế chỗ chừa, không build:
- Lớp 3 (LLM reasoning có structured output) — hook sẵn nhưng tắt mặc định.
- Embedding semantic (case rất generic) — cột `embedding vector(768)` chừa sẵn, không backfill.
- Combo/BOM (case #7), conflict detector, Memory Graph view, Bulk import mapping.

## Kiến trúc dữ liệu

### Bảng mới: `supplier_item_mappings`
```text
id uuid pk
tenant_id uuid (RLS theo tenant)
supplier_id uuid → suppliers(id)
raw_name text                  -- nguyên văn NCC ghi
raw_name_norm text             -- đã NFD strip dấu, collapse space, lowercase
raw_unit text                  -- ĐVT NCC ghi
product_id uuid → products(id)
unit_conversion_factor numeric default 1   -- raw_unit → base_unit
confidence numeric             -- 0..1
match_count int default 1
last_seen timestamptz
source text check in ('auto','user_confirm','user_create','imported','llm')
reasoning text                 -- nếu do LLM resolve
created_by uuid, created_at, updated_at
unique (tenant_id, supplier_id, raw_name_norm)
index (tenant_id, supplier_id, raw_name_norm)
```

### Bảng mới: `item_resolution_log` (audit)
```text
id, tenant_id, invoice_line_id (nullable, FK soft)
supplier_id, raw_name, raw_unit, qty, price
resolved_product_id (nullable)
method text  -- 'cache' | 'fuzzy' | 'llm' | 'manual' | 'new_product'
score numeric
signals jsonb  -- {text:0.81, semantic:null, unit:1, price:0.7, history:0.9, sku:0}
reviewed_by, reviewed_at
created_at
```

### Mở rộng `products` (chừa chỗ cho v2)
- `aliases text[] default '{}'`
- `embedding vector(768)` (nullable; tạo extension `vector` if not exists; KHÔNG backfill ở MVP)

### RLS
Cả 2 bảng mới: chỉ thành viên tenant đọc/ghi, dùng `is_tenant_member(auth.uid(), tenant_id)` + role check (`accountant|admin|owner`) cho insert/update/delete, theo đúng pattern `products` hiện tại.

## Module code

### 1. `src/lib/items/normalize.ts` (client-safe)
- `normalizeName(s)`: NFD → strip diacritics → lowercase → collapse whitespace → strip punctuation rìa.
- `normalizeUnit(s)`: dùng lại `findCommonUnit` (đã có ở `src/lib/common-units.ts`).
- Token hóa cho text similarity.

### 2. `src/lib/items/resolver.server.ts` (server-only)
Hàm `resolveVendorLine({ tenantId, supplierId, rawName, rawUnit, qty, price })`:

1. **Lớp 1 — cache**: query `supplier_item_mappings` exact `(supplier_id, raw_name_norm)`. Nếu hit & `confidence ≥ 0.9` & `match_count ≥ 3` → trả về `{ method: 'cache' }`. Nếu hit nhưng yếu hơn → coi như "ứng viên rất mạnh" và đi tiếp lớp 2 để cross-check.

2. **Lớp 2 — multi-signal scoring** trên top-N candidate (top 50 theo trigram/`name_norm` ILIKE + tất cả mapping của supplier):
   - text (Jaro-Winkler hoặc Levenshtein ratio) — 30%
   - semantic (skip ở MVP, weight phân bổ lại sang text) — 25%
   - unit match (hard filter; nếu khác hẳn nhóm như kg vs cái → reject; nếu khớp/đổi được qua `product_unit_conversions` → 20%)
   - price band (±30% giá lịch sử cùng product) — 10%
   - supplier history (NCC này đã từng giao product này?) — 10%
   - SKU/code chứa trong raw_name — 5%
   - Threshold: `≥0.9` auto, `0.7..0.9` đề xuất top 3, `<0.7` flag "mặt hàng mới".

3. **Lớp 3 — LLM** (đặt sau flag, mặc định off): gọi `google/gemini-3-flash-preview` qua Lovable AI với tool-call `resolve_vendor_item` (structured output: product_id, confidence, reasoning, unit_factor). Chỉ chạy khi `<0.7` và đã có category gợi ý từ classifier 152/153/156.

4. Ghi `item_resolution_log` cho mọi lần gọi.

### 3. `src/lib/items/mappings.functions.ts` (createServerFn)
- `getResolutionForLines({ invoiceId })`: chạy resolver cho từng dòng → trả về proposal hiển thị trong sheet.
- `confirmMapping({ supplierId, rawName, rawUnit, productId, unitFactor })`: upsert vào `supplier_item_mappings` với `source='user_confirm'`, tăng `match_count`, set `confidence=0.98`.
- `createProductFromRaw({ supplierId, rawName, rawUnit, itemType, defaultAccount, suggestedCode })`: tạo `products` mới + tạo mapping luôn.
- `splitMapping(...)` / `rejectMapping(...)` cho UX.

### 4. UX trong `inbox-item-sheet.tsx` (bảng hàng hóa hiện có)
Mỗi dòng goods/services hiển thị **trạng thái resolve**:
- 🟢 Auto-matched (≥0.9, đã có cache): badge "Đã ghép tự động (X lần, Y%)" + link "Đổi".
- 🟡 Cần xác nhận (0.7–0.9): inline radio top-3 + nút "Xác nhận và lưu rule cho lần sau".
- 🔵 Mặt hàng mới (<0.7): form rút gọn (mã đề xuất, tên, loại 152/153/156, ĐVT) + 3 nút "Tạo mã" / "Chọn mã đã có" / "Bỏ qua".

Khi sheet mở: gọi `getResolutionForLines` (React Query, key có `tenantId` — đã sửa cross-tenant ở các turn trước, tiếp tục giữ pattern). Khi confirm/tạo → invalidate keys `["resolution", invoiceId]`, `["mappings", supplierId]`.

### 5. Power user (gói Tăng trưởng) — chỉ tạo route shell, để v2 build chi tiết
- `/_app/settings/item-mappings` — bảng mapping filter theo NCC, edit inline, merge/split.
- Hook trong `ai-memory` panel: "Trí nhớ mặt hàng theo NCC — X dòng".

## Mối quan hệ với 6 agent
- Resolver là **service độc lập** trong `src/lib/items/`, không thuộc agent nào. Cả Trích xuất → Hạch toán → Đối soát → Báo cáo đều gọi.
- Agent Hạch toán sau khi có `product_id` mới quyết TK Nợ/Có dựa trên `products.stock_account` / `expense_account` + business rules 152/153/156 (đã có ở `classify-line-v2.ts`).

## Edge cases — xử lý ở MVP
| Case | Cách xử lý MVP |
|------|----------------|
| 1. Quy cách khác (ream/thùng) | `unit_conversion_factor` trong mapping; UI hỏi khi confirm lần đầu |
| 2. Tên generic ("Giấy A4") | Khi confirm lần đầu, lưu mapping cụ thể cho NCC đó |
| 3. Brand tương đương | Không auto-merge, buộc KTV chọn |
| 4. NCC nhiều variant → 1 mã hệ thống | Nhiều raw_name cùng map 1 product_id (đã hỗ trợ) |
| 5. Hệ thống chi tiết, NCC gộp | Reject auto, flag "cần split tay" |
| 6. Item mới | Form tạo nhanh 1-click |
| 7. Combo/BOM | V2 — MVP cứ tạo product `item_type='combo'` treo riêng |
| 8. Sai chính tả nặng | `normalizeName` robust (NFD, strip dấu, collapse space) |

## Migrations cần chạy
1. `create extension if not exists vector;` (chừa cho v2; nếu Supabase chưa bật, bỏ qua cột embedding, thêm sau).
2. Tạo `supplier_item_mappings` + RLS + indexes.
3. Tạo `item_resolution_log` + RLS.
4. `alter table products add column aliases text[] default '{}'`, `add column embedding vector(768)` (cột embedding optional).

## Việc cần làm (build mode)
1. Migration DB (1 file, gộp 4 mục trên).
2. `src/lib/items/normalize.ts` + `resolver.server.ts` + `mappings.functions.ts`.
3. Tích hợp resolver vào pipeline parse hóa đơn đầu vào (gọi sau khi có lines, trước khi propose journal).
4. Cập nhật `inbox-item-sheet.tsx`: cột "Mã hệ thống" + 3 trạng thái UX (auto / confirm / new).
5. Đảm bảo query keys có `tenantId` (giữ pattern đã sửa).
6. Smoke test: 1 hóa đơn 3 dòng (1 đã có cache, 1 mới gặp, 1 hoàn toàn mới) → kiểm 3 trạng thái render đúng.

## Câu hỏi cần chốt trước khi build
1. Có bật `pgvector` ngay để chừa cột `embedding`, hay để v2 mới thêm? (em đề xuất: để v2, MVP không cần.)
2. Lớp 3 (LLM) — bật mặc định hay tắt (chỉ chạy khi KTV bấm "Nhờ Fin gợi ý")? (em đề xuất: tắt, có nút).
3. UX trạng thái resolve hiển thị **inline trong bảng hàng hóa hiện tại** của Đề xuất Fin, hay tách **section riêng "Khớp mặt hàng"** phía trên bảng? (em đề xuất: inline, thêm 1 cột "Mã hệ thống" + badge).
