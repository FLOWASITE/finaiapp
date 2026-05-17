## Mục tiêu

Đưa Phân hệ Kho lên chuẩn Xero/QuickBooks/SAP B1 + TT133/200: thẻ kho (kardex), kiểm kê có bút toán, cảnh báo tồn tối thiểu, danh mục, dashboard.

## Phase 1 — Schema (1 migration)

**`products` mở rộng**: `category_id`, `barcode`, `min_stock`, `max_stock`, `is_active`, `notes`
**Mới `product_categories`**: name, parent_id (tenant-scoped, RLS chuẩn)
**Mới `stock_takes`**: code, take_date, status (draft/posted/void), warehouse, notes, journal_entry_id
**Mới `stock_take_lines`**: stock_take_id, product_id, system_qty, counted_qty, diff_qty, unit_cost, diff_value
**Trigger**: tự update `products.on_hand` & ghi `stock_movements` khi post stock_take

## Phase 2 — Server functions
- `categories.functions.ts`: CRUD danh mục
- `inventory.functions.ts` mở rộng:
  - `getProduct(id)` — chi tiết + thẻ kho (kardex từ `stock_movements` + running balance)
  - `listMovements({from,to,product_id,type})` — log toàn bộ phát sinh
  - `inventoryDashboard()` — KPI: tổng giá trị tồn, # SKU, # low-stock, # movements 30d, top-value items, low-stock list
- `stock-takes.functions.ts`: `createStockTake`, `getStockTake`, `updateStockTakeLines`, `postStockTake` (sinh bút toán Nợ 156/Có 711 cho thừa, Nợ 632/Có 156 cho thiếu), `voidStockTake`

## Phase 3 — UI
- `/inventory` (refactor): KPI strip (tổng giá trị, SKU, low-stock, movements 30d), bộ lọc danh mục + search + chỉ low-stock, badge "Sắp hết"
- `/inventory/$id`: thông tin SP + **Thẻ kho (kardex)** với running balance + form nhập/xuất nhanh
- `/inventory/movements`: log Nhập-Xuất-Tồn có filter ngày/SP/loại + xuất CSV
- `/inventory/categories`: CRUD danh mục (dialog)
- `/inventory/stock-takes`: list + tạo phiếu kiểm kê → bảng đếm (system_qty pre-fill, nhập counted_qty) → post sinh bút toán

## Phase 4 — Sidebar & routing
Nhóm "Kho vận" → Tồn kho, Thẻ kho/Phát sinh, Kiểm kê, Danh mục

## Phạm vi không làm lần này (đợi yêu cầu)
- Multi-warehouse (1 kho mặc định)
- FIFO/LIFO (giữ WAVG hiện tại)
- Lô/serial, hạn dùng
- Lệnh sản xuất / BOM
- Stock transfer giữa kho

## Kỹ thuật
- 1 migration duy nhất
- `createServerFn` + `requireSupabaseAuth`
- Bút toán kiểm kê: theo TT133 (`156`/`632`/`711`/`1381`/`3381` đơn giản hoá → dùng 632/711)
- Stock card từ `stock_movements` (đã có), không tạo bảng mới

Bạn duyệt em làm liền — sẽ chia 2 turn: turn 1 migration + functions, turn 2 toàn bộ UI.