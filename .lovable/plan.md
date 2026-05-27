## Tóm tắt
Thêm 2 chip lọc nhanh **"Chỉ Hàng hóa"** và **"Chỉ Dịch vụ"** vào hàng QuickFilter hiện tại của màn hình Danh mục Hàng hóa & Dịch vụ.

## Thay đổi cụ thể

### 1. `src/components/catalog/QuickFilterChips.tsx`
- Thêm 2 key mới vào `FILTER_KEYS`: `GOODS` (`"goods"`) và `SERVICES` (`"services"`).
- Thêm 2 chip mới vào mảng `chips`:
  - "Chỉ Hàng hóa" — icon `Package`, tone mặc định.
  - "Chỉ Dịch vụ" — icon `Wrench`, tone mặc định.
- 2 chip này đặt cạnh 4 chip hiện tại trong cùng hàng flex-wrap.

### 2. `src/components/catalog/CatalogPage.tsx`
- Trong hàm `filteredNoCategory`, thêm 2 điều kiện lọc:
  - Nếu `GOODS` active: chỉ giữ item có `itemType === "goods"`.
  - Nếu `SERVICES` active: chỉ giữ item có `itemType === "service"`.
- Logic: nếu cả 2 chip cùng active → lọc theo cả 2 (tức hiển thị goods OR service, bỏ `mixed`).

### 3. Hành vi tương tác
- Click chip → toggle trạng thái active/inactive (reuse `toggleFilter`).
- Chip active: nền xanh `[#0F6E56]`, chữ trắng.
- Chip inactive: nền trắng, viền xám.
- Tương thích với các filter chip khác và search/category hiện tại.

## Không thay đổi
- Không đụng đến 3 tab Của tôi / Fin đề xuất / Thư viện.
- Không đụng đến sidebar category, search bar, drawer, hay Zustand store ngoài việc reuse `activeFilters` và `toggleFilter`.
- Không thay đổi dữ liệu mẫu `sample-catalog.ts`.