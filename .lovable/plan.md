## Mục tiêu

Thay thế hoàn toàn trang `/items` hiện tại (đang nối DB Supabase) bằng màn hình **Danh mục Hàng hóa & Dịch vụ** mới theo spec v2.0 — chạy hoàn toàn trên state in-memory (Zustand) với dữ liệu mẫu, hỗ trợ chuyển đổi chế độ kế toán TT99/TT133.

## Lưu ý quan trọng

- Trang cũ `/items` (cùng `/items/categories`, `/items/units`) đang dùng DB thật qua `inventory.functions.ts`, `units.functions.ts`. Sau khi thay, **các route con và server functions cũ vẫn giữ nguyên** (không xoá DB, không xoá file functions) để tránh vỡ các nơi khác đang import (POS, hoá đơn mua/bán có thể đang dùng `listProducts`). Chỉ thay phần UI ở `src/routes/_app/items/index.tsx`.
- Trang mới hoàn toàn độc lập với Supabase — không gọi server fn, không đọc DB.
- Spec yêu cầu Zustand + Inter font. Sẽ cài `zustand` và load Inter qua Google Fonts trong `__root.tsx`.
- Sample data: spec nói "tôi sẽ paste riêng `sample-catalog-data.ts`" — vì người dùng chưa paste, sẽ tự sinh ~30 item mẫu hợp lý (18 active, 8 AI-suggested, 4 library-only) bao quát các category cốt lõi (Tiện ích, Viễn thông, Marketing, F&B...). Khi user paste file thật sẽ thay bằng 1 edit.

## Cấu trúc file sẽ tạo

```
src/
├── types/catalog.ts
├── data/
│   ├── categories.ts
│   ├── account-labels.ts
│   └── sample-catalog.ts
├── stores/catalogStore.ts
├── lib/
│   ├── catalog-search.ts
│   └── catalog-format.ts
└── components/catalog/
    ├── CatalogPage.tsx
    ├── CatalogHeader.tsx
    ├── CatalogSearchBar.tsx
    ├── CatalogTabs.tsx
    ├── QuickFilterChips.tsx
    ├── CategorySidebar.tsx
    ├── ItemList.tsx
    ├── ItemCard.tsx
    ├── ItemBadges.tsx
    ├── ItemDetailDrawer.tsx
    ├── BulkActionBar.tsx
    ├── EmptyState.tsx
    ├── AISuggestionCard.tsx
    └── RegimeSwitch.tsx
```

Và **rewrite** `src/routes/_app/items/index.tsx` để chỉ render `<CatalogPage />`.

## Chi tiết kỹ thuật

1. **Types & data** (`types/catalog.ts`, `data/categories.ts`, `data/account-labels.ts`, `data/sample-catalog.ts`) — copy nguyên văn từ spec, sample tự sinh.
2. **Zustand store** (`stores/catalogStore.ts`) — đầy đủ setters: `setSearchQuery`, `setActiveTab`, `setSelectedCategory`, `toggleFilter`, `toggleItemSelection`, `clearSelection`, `openDrawer`, `addItemToMine` (set `isActive:true`), `removeItemFromMine`, `updateItem`, `switchRegime`.
3. **Search** (`lib/catalog-search.ts`) — normalize NFD + bỏ dấu, match trên name/nameEn/code/aliases/typicalSuppliers/cả 2 account/subcategory.
4. **Tokens màu** — thêm CSS vars FinAI vào `src/styles.css` (`--finai-teal-*`, semantic warn/caution/info/success/neutral) và class tiện ích để dùng trong components.
5. **Components**:
   - `CatalogHeader`: tiêu đề + company + `RegimeSwitch` (pill dropdown TT99/TT133) + nút "+ Tạo mới".
   - `RegimeSwitch`: shadcn `DropdownMenu`, 2 option, check icon, đổi xong toast.
   - `CatalogSearchBar`: input + Search icon, autofocus phím `/`, `Cmd/Ctrl+K`, clear button.
   - `CatalogTabs`: 3 tab segmented control (Của tôi/Fin đề xuất/Thư viện) + badge count, tab "Fin đề xuất" có Sparkles teal-500.
   - `QuickFilterChips`: 4 chip (Đang dùng tháng này / Có cảnh báo / Trả trước · 242 / NCC nước ngoài · FCT).
   - `CategorySidebar`: 220px fixed, list category có ≥1 item trong view hiện tại.
   - `ItemList`: group "DÙNG GẦN ĐÂY" + "FIN ĐỀ XUẤT THÊM" trong tab Của tôi; render `ItemCard` hoặc `AISuggestionCard`.
   - `ItemCard` + `ItemBadges`: TK badge dynamic theo `company.accountingRegime`, tooltip tên TK từ `getAccountLabel`.
   - `ItemDetailDrawer`: shadcn Sheet right-side, hiển thị song song 2 cột TT99/TT133, section "Chế độ kế toán áp dụng" trên cùng, footer link TT99/2025/TT-BTC.
   - `BulkActionBar`: hiện khi `selectedItemCodes.size > 0`, fixed bottom.
   - `EmptyState`: cho mỗi tab khi rỗng.
6. **Phím tắt**: gắn listener global trong `CatalogPage` (`/`, `Esc`, `Cmd/Ctrl+K`).
7. **Responsive**: `< 768px` sidebar thành dropdown phía trên list; RegimeSwitch xuống dòng riêng.
8. **Cài đặt**: `bun add zustand`. Inter font: thêm `<link>` Google Fonts trong `<head>` của `__root.tsx` (giữ font hiện tại của app, chỉ áp dụng Inter cho CatalogPage qua class `font-[Inter]` ở root container).
9. **Imports cũ cần giữ**: KHÔNG xoá `inventory.functions.ts`, KHÔNG xoá `/items/categories.tsx`, `/items/units.tsx`. Chỉ rewrite `index.tsx`.

## Acceptance check cuối

Sẽ verify build pass và tự kiểm tra: load trang, đổi regime đổi badge, search "tien dien" lọc đúng, drawer mở song song 2 cột, phím `/` focus search.
