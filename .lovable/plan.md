## Mục tiêu
Hoàn tất việc thay thế SAMPLE_ITEMS bằng dữ liệu thật (products + tenant_product_catalog) cho tab "Hàng hóa & Dịch vụ", và bật CRUD ghi thẳng xuống DB.

## Các bước còn lại

### 1. Wire loader cho route `/items`
File: `src/routes/_app/items/index.tsx`
- Thêm `loader: ({ context }) => context.queryClient.ensureQueryData(catalogQueryOptions)`
- Thêm `errorComponent` và `notFoundComponent` cơ bản

### 2. Cập nhật `src/stores/catalogStore.ts`
- Bỏ import `SAMPLE_ITEMS`; `items` khởi tạo `[]`
- Thêm action `setItems(items: CatalogItem[])` để CatalogPage sync dữ liệu từ server vào store
- Giữ nguyên các UI state khác (filters, selectedId...)

### 3. Cập nhật `src/components/catalog/CatalogPage.tsx`
- `useSuspenseQuery(catalogQueryOptions)` để đọc data
- `useEffect` đồng bộ data → `setItems` trong store (để các filter/search hiện có vẫn chạy)
- Không đổi UI

### 4. Bật CRUD ghi DB
Tạo thêm server-fn trong `src/lib/catalog/catalog.functions.ts`:
- `upsertCatalogItem({ data: CatalogItem })` → map ngược về cột `products` (code, name, unit, item_type, unit_cost, unit_price, category_id, aliases, notes, is_active) và `upsert` vào `products`
- `deleteCatalogItem({ id })` → soft delete bằng `is_active = false` trên `products`

Cập nhật các điểm gọi mutate trong CatalogPage / ItemCard / ItemDetailDrawer / ItemCreateDialog / ItemEditDialog:
- Thay `createItem/updateItem/removeItemFromMine` bằng `useMutation` gọi `upsertCatalogItem` / `deleteCatalogItem`
- `onSuccess`: `queryClient.invalidateQueries({ queryKey: ["catalog"] })` và `["products-picker"]` để form Phiếu mua/bán thấy ngay
- Toast báo lỗi/thành công

### 5. Field mapping & default
Các field chỉ-frontend (amortization, allocationMethod, foreignSupplierTax, frequency, vatReductionEligible, deductible, industryRelevance, fctVatRate, fctCitRate) **không lưu DB** ở đợt này — adapter đã fill default khi đọc. Sẽ thêm cột sau nếu cần.

Items từ `tenant_product_catalog` (gợi ý AI) khi user "Thêm vào mặt hàng của tôi" sẽ tạo bản ghi `products` mới qua `upsertCatalogItem`.

### 6. Kiểm thử
- Mở `/items` → thấy 16 sản phẩm thật + gợi ý từ tenant_product_catalog
- Tạo / sửa / xoá → reload thấy thay đổi
- Mở Phiếu mua/bán → ProductPicker thấy item mới ngay

## Phạm vi KHÔNG đổi
- UI/layout CatalogPage, ItemCard, sidebar category
- Form Phiếu mua/bán, ProductPickerCell
- Schema DB (không migration mới)
