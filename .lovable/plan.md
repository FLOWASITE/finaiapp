## Vấn đề

Trong tổ chức **Kojavm**, Trí nhớ AI rỗng dù đã duyệt 17 chứng từ qua Inbox AI và ghi 11 phiếu mua. Lý do (đã xác minh trên DB):

| Bảng Trí nhớ AI | Kojavm |
|---|---|
| `ai_memory_rules` | 0 |
| `ai_memory_partners` | 0 |
| `ai_line_classifications` | 0 |
| `supplier_item_mappings` | 0 |
| `invoices` (mà graph đang đọc) | **0** |
| `purchase_vouchers` posted | **11** |
| `inbox_decisions` approved | **17** |

Nguyên nhân kỹ thuật:

1. **Inbox AI ghi sổ thẳng vào `purchase_vouchers`** (qua `materializePurchaseVoucher` trong `src/lib/inbox-ai.functions.ts`), **không đi qua `invoices` + `ai_journal_proposals`**.
2. Hàm học `learnLineClassificationsFromApproval` chỉ được gọi từ luồng duyệt proposal (`src/lib/categorize.functions.ts`) — luồng này yêu cầu có `invoices`. Luồng Inbox AI hiện tại **không trigger** nó → `ai_line_classifications` rỗng → không có rule/partner nào được suy ra.
3. `learnPurposeForLines` (đã có sẵn trong luồng Inbox AI) chỉ ghi `supplier_item_mappings` **khi `purchase_purpose.code` có giá trị** — phần lớn phiếu Kojavm không có purpose code → bảng cũng rỗng.
4. `getMemoryGraphData` trong `src/lib/graph/memory-graph.functions.ts` tính phân bố ngành/loại (supplierHistory) **chỉ từ bảng `invoices`** → Kojavm có 11 phiếu mua nhưng graph thấy 0.

## Mục tiêu

Mọi chứng từ duyệt qua **Inbox AI** đều phải nuôi Trí nhớ AI (ngành NCC, phân loại mặt hàng, item mapping, supplier history).

## Thay đổi

### 1. Học khi duyệt phiếu mua từ Inbox AI
File: `src/lib/inbox-ai.functions.ts` (cuối `materializePurchaseVoucher`, ngay sau khi insert `purchase_voucher_lines` thành công)

- Gọi một hàm mới `learnFromPurchaseVoucher(supabase, { tenantId, userId, voucherId, supplierId, lines })` — bọc try/catch, không chặn flow ghi sổ.
- Hàm này sống ở `src/lib/categorize/learn-line-classifications.server.ts` (mở rộng file hiện có):
  - Tái sử dụng logic `accountToKindV2` + `kindV2ToLegacy` với `debit_account` của từng dòng phiếu (đã có sẵn).
  - Upsert vào `ai_line_classifications` theo `(tenant_id, supplier_tax_id, line_name_norm)` — y hệt logic của `learnLineClassificationsFromApproval` nhưng input là `purchase_voucher_lines` thay vì `invoice_lines`.
  - Giữ `source = 'user_override'` để xếp tin cậy cao.

### 2. Luôn ghi `supplier_item_mappings` (kể cả thiếu purpose)
Cùng file `inbox-ai.functions.ts`, hàm `learnPurposeForLines`:

- Bỏ điều kiện chặn khi `purposeCode` rỗng — vẫn upsert `supplier_item_mappings` với `purpose_code = null` để Trí nhớ AI có dữ liệu liên kết NCC ↔ tên mặt hàng thô. Khi KTV chọn purpose sau, mới ghi đè.

### 3. Graph đọc lịch sử từ cả `purchase_vouchers`
File: `src/lib/graph/memory-graph.functions.ts`, trong `getMemoryGraphData`:

- Sau khối query `invoices` (đang dùng để tính `supplierHistory`), thêm query song song lên `purchase_vouchers` (12 tháng gần nhất, `status='posted'`) join `purchase_voucher_lines`:
  - Mỗi dòng cộng dồn vào `supplierHistory[supplier_id][kind]` theo `accountToKind(debit_account)` × `amount` (giống invoices).
- Không đổi shape trả về → frontend graph không cần sửa.

### 4. Backfill cho dữ liệu lịch sử của Kojavm (và các tenant khác)
Tạo migration script (chạy thủ công, không tự động) ở `scripts/backfill-ai-memory-from-purchase-vouchers.ts`:

- Quét tất cả `purchase_vouchers` `status='posted'` chưa có entry tương ứng trong `ai_line_classifications`.
- Gọi `learnFromPurchaseVoucher` cho từng phiếu để dựng lại trí nhớ.
- In log số dòng đã học theo tenant. Idempotent (upsert).

## Phạm vi không đụng tới

- Không đổi schema DB.
- Không sửa UI Trí nhớ AI (`src/routes/_app/ai.memory.tsx`, `MemoryGraph.tsx`, các `*Node.tsx`) — chỉ sửa data layer.
- Không đụng luồng `invoices` / `ai_journal_proposals` hiện có (vẫn hoạt động song song).
- Không đổi tên/thuật ngữ — vẫn dùng "Inbox AI" như đã thống nhất.

## Kết quả mong đợi

Sau khi merge + chạy backfill cho Kojavm:
- `ai_line_classifications`: có đủ entries cho ~17 chứng từ đã duyệt.
- `supplier_item_mappings`: có entries cho mọi dòng phiếu (kể cả chưa có purpose).
- Graph Trí nhớ AI hiển thị supplier history bars theo `purchase_vouchers`.
- Các phiếu duyệt mới qua Inbox AI sẽ tự động nuôi memory mà không cần thao tác bổ sung.
