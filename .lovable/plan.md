## Mục tiêu

Tab **Hàng hóa & Dịch vụ** (`/items`) hiện đang hiển thị 1 bộ dữ liệu mẫu cứng (`SAMPLE_ITEMS`, ~3000 dòng trong `src/data/sample-catalog.ts`). Sẽ thay hoàn toàn bằng dữ liệu thật, gộp 2 nguồn:

- `products` (16 mặt hàng đang dùng ở Phiếu mua/bán, Kho) — nguồn chính.
- `tenant_product_catalog` (catalog tinh gọn, dùng cho AI gợi ý) — bổ sung các mặt hàng chưa thành `product`.

Các thao tác Thêm / Sửa / Xóa / Kích hoạt trên CatalogPage sẽ ghi thẳng vào DB và làm mới cache để Phiếu mua/bán nhìn thấy ngay.

## Phạm vi & cách hiển thị 3 tab

- **Mặt hàng của tôi**: `products` có `is_active = true`.
- **Gợi ý của AI**: `tenant_product_catalog` mà chưa có `product` tương ứng (so theo `name_norm`) — coi như catalog gợi ý chưa "đưa vào dùng".
- **Thư viện**: union của hai nguồn trên (đọc-chỉ).

Bộ lọc nhanh hiện có (Hàng hóa / Dịch vụ / Dùng tháng này / Có cảnh báo / Trả trước / NCC nước ngoài) sẽ map tốt nhất có thể với data thật; những field không có trong DB sẽ ẩn chip lọc tương ứng thay vì hiển thị filter rỗng.

## Mapping `products` → `CatalogItem`

| CatalogItem | Nguồn |
|---|---|
| `code` | `products.code` |
| `name` | `products.name` |
| `itemType` | `products.item_type` ("goods" \| "service" \| "mixed"), default `goods` |
| `defaultAccountTT99` / `defaultAccountTT133` | `stock_account` (cho goods) hoặc `expense_account` (cho service); cùng giá trị cho cả 2 chế độ vì DB không phân biệt |
| `altAccounts` | `[revenue_account, cogs_account]` lọc null |
| `vatRateStandard` | `products.vat_rate ?? 0.1` |
| `aliases` | `products.aliases ?? []` |
| `isActive` | `products.is_active` |
| `category` | Map từ `product_categories.name` về một mã `CategoryCode` đã có; không khớp → "VAN_PHONG" (fallback) |
| `subcategory` | `product_categories.name` (giữ nguyên tên gốc để CategorySidebar gom nhóm) |
| `usageCount30Days` | 0 (không có sẵn — đợt sau) |
| Các field còn lại (`amortization`, `allocationMethod`, `foreignSupplierTax`, `frequency`, `vatReductionEligible`, …) | Mặc định an toàn (`expense_immediately`, `single`, `none`, `monthly`, `false`, …) |

Mapping `tenant_product_catalog` → `CatalogItem`: chỉ điền `code = sku ?? "TPC-<id8>"`, `name`, `aliases`, `itemType = "goods"`, `isAiSuggested = true`, `isActive = false`, còn lại dùng default.

## Thay đổi code

### 1. `src/lib/catalog/adapt.ts` (mới)
- `productToCatalogItem(p, categoryNameById)` — adapter
- `tpcToCatalogItem(row)` — adapter
- `mergeCatalog(products, tpcRows)` — gộp, loại trùng theo `name_norm`, trả về `CatalogItem[]`
- Hàm pure, không phụ thuộc Supabase → test dễ.

### 2. `src/lib/catalog/catalog.functions.ts` (mới)
- `loadCatalog` server-fn: chạy song song `listProducts()`, `listProductCatalog()`, `listCategories()`; trả `{ items: CatalogItem[] }` (đã merge).
- Lý do tách: gom 3 query về 1 round-trip cho route loader.

### 3. `src/routes/_app/items/index.tsx`
- Thêm `loader` prime cache `loadCatalog` qua `queryOptions` + `useSuspenseQuery` (theo pattern TanStack Query của project).
- Truyền `initialItems` xuống `CatalogPage`.

### 4. `src/stores/catalogStore.ts`
- Bỏ import `SAMPLE_ITEMS`; `items` khởi tạo `[]`.
- Thêm action `setItems(items: CatalogItem[])` để loader đổ data thật vào store.
- Các action mutate đổi sang async, gọi server-fn rồi gọi `queryClient.invalidateQueries(["catalog"])`:
  - `addItemToMine(code)` → `upsertProduct({ code, name, item_type, is_active: true, ... })`
  - `removeItemFromMine(code)` → `upsertProduct({ id, is_active: false })` (mềm; không xóa cứng để tránh vỡ tham chiếu).
  - `updateItem(code, updates)` → `upsertProduct({ id, ...changes })`
  - `createItem(item)` → `upsertProduct({ ... })`
- Vì store không có sẵn `queryClient`, sẽ inject bằng cách: actions trả `Promise` và component dùng `useMutation` để gọi; store chỉ giữ UI state. Refactor tối thiểu, không đập vỡ API hiện tại.

### 5. `src/components/catalog/CatalogPage.tsx`
- Dùng `useSuspenseQuery(catalogQueryOptions)` để đọc data; sync vào store qua `useEffect(() => setItems(data.items), [data])`.
- Bọc các button mutate (xóa khỏi mặt hàng của tôi, kích hoạt từ gợi ý) bằng `useMutation` để có loading + toast lỗi.
- Sửa `ItemCard` và `ItemDetailDrawer`: cùng pattern useMutation cho action xóa/kích hoạt.

### 6. `ItemCreateDialog` / `ItemEditDialog`
- Submit gọi `upsertProduct` (không còn `createItem` trực tiếp vào store).
- Invalidate `["catalog"]` và `["products-picker"]` (cho Phiếu mua/bán cũng refresh).

### 7. Xóa rác
- Xóa import `SAMPLE_ITEMS` ở mọi nơi. Giữ file `src/data/sample-catalog.ts` lại trong repo (chưa xóa) để khỏi đụng nếu nơi khác còn dùng, nhưng nếu grep xác nhận chỉ store dùng thì xóa luôn file đó cuối plan.

## Lưu ý kỹ thuật

- **Schema lệch nhiều**: `CatalogItem` có ~25 field, bảng `products` chỉ phủ ~10. Adapter sẽ điền default an toàn cho phần còn lại để các filter/badge không vỡ; UI hiển thị "—" thay vì giá trị sai lệch khi không có dữ liệu (ItemBadges cần kiểm thêm).
- **Category enum vs `product_categories`**: `CategoryCode` là enum cố định trong code, còn DB lưu category mở. CategorySidebar sẽ chuyển sang nhóm theo `subcategory` (= tên category DB) khi có, fallback theo `category` enum khi không. Việc này giữ trải nghiệm gom nhóm cũ mà không cần migrate DB.
- **Không thêm migration**: bài này không sửa schema — chỉ đọc/ghi qua server-fn có sẵn (`listProducts`, `upsertProduct`, `listProductCatalog`).
- **RLS**: các server-fn này đã có `requireSupabaseAuth` + tenant scoping → không cần đổi policy.
- **Đồng bộ với Phiếu**: sau mỗi mutate, invalidate cả `["products-picker"]` để ProductPickerCell ở Phiếu mua/bán cập nhật ngay.

## Ngoài phạm vi

- Không sửa Phiếu mua/bán, không động vào `ProductPickerCell`.
- Không tính lại `usageCount30Days` (sẽ làm khi có nhu cầu — cần đọc từ `purchase_invoice_lines` + `sales_invoice_lines`).
- Không thêm field mới vào DB; nếu sau này cần `amortization`, `vat_reduction_eligible`, v.v. sẽ migrate riêng.
