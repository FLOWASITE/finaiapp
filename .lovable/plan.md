## Mục tiêu

Khi resolver không tìm thấy `products` (Mục của tôi) khớp tên trên hóa đơn, fallback sang **`tenant_product_catalog`** (170 items thư viện đã có category/account/VAT) → trả về dưới dạng **"gợi ý từ thư viện"**. KTV bấm 1 nút để promote item thư viện vào `products`, kế thừa đầy đủ metadata, và lần sau cache Layer 1 tự bắt.

Đây là mảnh ghép biến 170 item tĩnh thành **dữ liệu sống** trong pipeline FinAI.

## Pipeline sau khi sửa

```text
Hóa đơn dòng → resolveVendorLine()
  ├─ L1 cache (supplier_item_mappings)         ─ auto
  ├─ L2 fuzzy products + semantic              ─ auto / review
  ├─ L2.5 [MỚI] fuzzy tenant_product_catalog   ─ library_suggestion
  └─ L3 none                                    ─ new
```

## Thay đổi

### 1. `src/lib/items/resolver.server.ts`
- Thêm type mới:
  ```ts
  method: "cache" | "fuzzy" | "library" | "none"
  status: "auto" | "review" | "new" | "library_suggestion"
  ```
- `Candidate` thêm field optional `fromLibrary?: { catalog_id, category, subcategory, default_account, vat_rate, item_type }` — KHÔNG có `product_id` (chưa tồn tại trong `products`).
- Sau khi L2 fuzzy fail (`top.length === 0` hoặc `best.score < 0.7`), gọi hàm mới `searchLibrary()`:
  - Query `tenant_product_catalog` với `is_global=true` + ILIKE trên `name` và `aliases` + textSim scoring.
  - Trả top-3 với score ≥ 0.6.
  - Status = `"library_suggestion"`, method = `"library"`.
- Log vẫn ghi vào `item_resolution_log` với `method="library"`, `resolved_product_id=null`.

### 2. Server function mới: `src/lib/items/promote-from-library.functions.ts`
- `promoteCatalogToProduct({ catalogId, supplierId?, rawName? })`:
  - Đọc 1 row `tenant_product_catalog` (theo `catalogId`).
  - INSERT `products` cho tenant hiện tại: code (auto-gen từ category prefix + sequence), name, unit, `item_type`, `stock_account`/`expense_account` derive từ `default_account` (152/153/156→stock, 642/242/211/213→expense), `vat_rate`, aliases (kế thừa + thêm `rawName` nếu có).
  - Nếu có `supplierId` + `rawName`: insert `supplier_item_mappings` (confidence 0.9, match_count 1) để L1 cache bắt ngay lần sau.
  - Return new product row.

### 3. UI: nơi hiện candidates (ví dụ `InvoiceLineResolver` / `LineMappingDialog`)
- Khi `status === "library_suggestion"`: render section "💡 Gợi ý từ Thư viện chuẩn" (badge khác màu với candidates từ "Mục của tôi").
- Mỗi suggestion hiển thị: tên + nhóm (category badge) + TK (`default_account`) + VAT.
- Nút **"Thêm vào Mục của tôi & dùng"** → gọi `promoteCatalogToProduct` → refetch resolver → auto-select item mới.

### 4. (Không thay) RLS / migration
- Không cần migration — chỉ đọc thêm từ bảng đã có. `tenant_product_catalog` đã có RLS cho `is_global=true` readable bởi mọi tenant.

## Ngoài phạm vi (làm sau)

- Lọc library theo VSIC ngành tenant (hướng đi #3).
- LLM Layer 3 reasoning khi cả products + library đều miss.
- Bulk "promote nhiều items 1 lần" từ tab Thư viện (hướng đi #2 — "Sao chép sang Mục của tôi").

## Kết quả đo được

- Hóa đơn có tên "Tiền điện T5/2026" từ EVN → trước: status `new`, KTV phải tạo product tay + chọn TK + VAT. Sau: hiện gợi ý "DV - Tiền điện văn phòng (TK 6427, VAT 10%)" → 1 click xong.
- Sau ~10 hóa đơn EVN, L1 cache đầy → auto 100%, không cần hỏi nữa.
