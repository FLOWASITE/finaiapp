## Mục tiêu

Trong Inbox AI → Đề xuất Fin, khi người dùng bấm **Duyệt & ghi sổ**:
1. Hệ thống tự tạo Nhà cung cấp / Khách hàng / Hàng hoá / Dịch vụ đúng theo gợi ý AI (không phải bấm "Tạo mới" từng dòng).
2. Nếu gợi ý sai, người dùng có nút **Sửa** trên từng dòng để chỉnh tên / MST / loại (HH, DV, NVL 152, CCDC 153, HH 156, TS 242, TSCĐ 211/213). Khi lưu, vừa tạo bản ghi đúng vừa ghi vào **Trí nhớ AI** để lần sau AI nhận diện đúng.

## Phạm vi thay đổi

### 1. Khối "Cần tạo mới vào hệ thống" (panel hiện có)

File: `src/components/inbox/inbox-item-sheet.tsx` → component `MissingMasterDataPanel`.

Thay đổi UI:
- Mỗi dòng có 3 nút: **Sửa** · **Tạo mới** · trạng thái "Đã tạo".
- Bấm **Sửa** → mở popover/inline-edit với các field:
  - Tên (text)
  - MST (text, chỉ KH/NCC)
  - Loại (select, chỉ cho hàng hoá): Hàng hoá 156, NVL 152, CCDC 153, TS phân bổ 242, TSCĐ hữu hình 211, TSCĐ vô hình 213, Dịch vụ
- Nút "Lưu & dạy AI" trong popover gọi 1 server fn mới (xem mục 3) để: cập nhật giá trị + ghi vào trí nhớ AI.

### 2. Tự động tạo khi Duyệt & ghi sổ

File: `src/lib/inbox-ai.functions.ts` → mở rộng `approveInboxItem`.

Trước khi insert journal_entries / materialize voucher, chạy bước **auto-resolve master data**:
- Với `source = "document"` và `doc_kind ∈ {purchase_invoice, sales_invoice}`:
  - Đọc danh sách missing đã được Enrich (dùng lại logic tại dòng 559–627).
  - Với mỗi item: gọi `createMissingMaster` (idempotent — đã có sẵn) cho KH/NCC/hàng/dịch vụ theo đúng tên + MST AI trích.
- Đối với **purchase_invoice**: hiện chỉ tạo journal + không tạo `purchase_vouchers` từ document. Bổ sung helper `materializePurchaseVoucherFromDocument` đối xứng với bản sales — auto-create supplier (tương tự logic customer hiện có) và line bằng product đã resolve. (Phạm vi: chỉ tạo voucher khi document chứa đủ dữ liệu; nếu không, bỏ qua như hiện trạng.)
- Sau khi resolve, khi build `sales_voucher_lines` / `purchase_voucher_lines`, set `product_id` đúng (hiện đang `null`).

Kết quả: 1 cú bấm Duyệt → bút toán + phiếu + master data đầy đủ.

### 3. Server fn mới: `updateMissingMasterAndLearn`

File: `src/lib/inbox-ai.functions.ts`.

Input:
```
{ entity: "customer"|"supplier"|"product"|"service",
  original_name: string,
  corrected: { name: string, tax_id?: string, item_type?: "goods"|"service"|"material"|"tool"|"asset_alloc"|"asset_tangible"|"asset_intangible" },
  source_document_id?: string }
```

Logic:
1. Gọi `createMissingMaster` với giá trị đã sửa → trả về party_id / product_id.
2. Ghi vào `ai_memory_partners` (cho KH/NCC):
   - upsert theo `(tenant_id, party_kind, party_id)`.
   - `display_name = corrected.name`, `memo_keywords` thêm `original_name` để lần sau OCR ra tên cũ vẫn map về đúng party.
   - `default_account` set theo loại nếu cần (NCC → 331, KH → 131).
3. Ghi vào `ai_memory_rules` (cho hàng/dịch vụ): rule kiểu `line_keyword → account` (156/152/153/242/211/213/5111).
   - Trường `pattern = original_name`, `action_account = account_for(item_type)`, `confidence = 0.9`, `sample_count = 1`.
4. Trả về id để UI hiển thị "Đã sửa & dạy AI".

### 4. Hiển thị nguồn gốc tài liệu

Trong panel "Cần tạo mới", truyền `documentId` của item xuống để server fn lưu trace vào `ai_memory_partners.behavior_text` ("học từ HĐ ABC ngày dd/mm/yyyy").

## Files dự kiến chỉnh

- `src/lib/inbox-ai.functions.ts` — thêm auto-resolve trong `approveInboxItem`, helper `materializePurchaseVoucherFromDocument`, server fn `updateMissingMasterAndLearn`, util `accountForItemType`.
- `src/components/inbox/inbox-item-sheet.tsx` — UI Sửa inline, gọi fn mới, vẫn giữ nút "Tạo mới" cho luồng thủ công.
- `src/lib/ai/inbox-types.ts` — mở rộng `MissingMasterData` để mang `item_type_guess` (AI gợi ý loại) nếu engine extract đã có.

## Không nằm trong phạm vi (đề xuất xác nhận)

- Bỏ hoàn toàn nút "Tạo mới" thủ công khỏi panel? — đề xuất GIỮ vì hữu ích khi user muốn tạo trước khi duyệt.
- Đào tạo AI multi-tenant cross-share? — giữ phạm vi trong 1 tenant.

## Câu hỏi cần xác nhận

1. Khi AI đoán **loại hàng** (152/153/156/242/211/213), nguồn dữ liệu lấy từ đâu hiện tại? Nếu chưa có, mặc định loại = "Hàng hoá 156" và để user sửa trong popover, OK chứ?
2. Với purchase invoice, mình có nên tự tạo luôn `purchase_vouchers` (đối xứng sales) trong cùng PR này không, hay tách PR riêng?
