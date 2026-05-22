# Kế hoạch — Phân hệ Hàng tồn kho (theo ảnh mẫu)

## 1. Mục tiêu
Dựng lại phân hệ **Hàng tồn kho** với bố cục tab giống ảnh, trong đó tab chính "Hàng tồn kho" là báo cáo **Nhập – Xuất – Tồn** dạng 2 cấp (Kho → Hàng hoá), có bộ lọc kỳ, lọc theo tài khoản/ĐVT, và nhóm cột Đầu kỳ / Nhập / Xuất / Cuối kỳ / Luỹ kế.

## 2. Hiện trạng
Đã có:
- Route layout `src/routes/_app/inventory.tsx` với 6 tab (Tồn kho, Phiếu nhập, Phiếu xuất, Thẻ kho, Kiểm kê, Danh mục kho)
- Server fn `getStockIOSummary` đã trả đủ opening/in/out/closing theo product + tuỳ chọn `by_warehouse`
- `listMovements` đã hỗ trợ filter `status=posted|unposted`
- CRUD kho (`warehouses.functions.ts`), kiểm kê (`stock-takes.functions.ts`), phiếu nhập/xuất (`createStockVoucher`)

Thiếu so với ảnh:
- Tab "Phiếu chưa nhập/xuất kho"
- Tab "Chuyển kho" (hiện chỉ có nhập/xuất, không có movement_type=`transfer`)
- Báo cáo tồn kho 2 cấp gộp theo kho + cột Luỹ kế (LK nhập/xuất từ đầu năm đến ngày kết kỳ)
- Nút "Tính giá kho" (recompute bình quân/giá vốn)
- Cột "Giá trị trung bình" (avg cost) trong báo cáo
- Bộ lọc theo tài khoản hàng tồn kho (152/153/155/156…)

## 3. Phạm vi & cấu trúc tab mới

```text
Hàng tồn kho          → /inventory                  (báo cáo NXT 2 cấp – thay trang index hiện tại)
Phiếu chưa nhập/xuất  → /inventory/unposted         (MỚI)
Phiếu nhập/xuất kho   → /inventory/vouchers         (GỘP: nhập + xuất trong 1 trang, có filter loại)
Chuyển kho            → /inventory/transfers        (MỚI)
Kho hàng              → /inventory/warehouses       (giữ – đổi nhãn từ "Danh mục kho")
Kiểm kho              → /inventory/stock-takes      (giữ – đổi nhãn "Kiểm kê" → "Kiểm kho")
```

- Hai trang cũ `vouchers-in.tsx` & `vouchers-out.tsx` xoá; trang mới `vouchers.tsx` hiển thị chung danh sách phiếu nhập + xuất với:
  - Filter Loại: `Tất cả | Nhập | Xuất` (default Tất cả)
  - Cột "Loại" có badge màu (xanh = Nhập, cam = Xuất)
  - 2 nút tạo mới: **+ Tạo phiếu nhập**, **+ Tạo phiếu xuất** (mở đúng form tương ứng đã có)
- Redirect các link cũ `/inventory/vouchers-in|out` → `/inventory/vouchers?type=in|out`
- Tab "Thẻ kho" hiện tại được gộp thành 1 nút trong báo cáo (mở `/inventory/stock-card?product=...`), không xuất hiện ở thanh tab chính để khớp ảnh.

## 4. Trang chính "Hàng tồn kho" (`/inventory`)

### Bộ lọc (header)
- Phạm vi: dropdown `Tất cả | <từng kho>` (multi-select)
- Tài khoản: 152, 153, 155, 156, 157, 158 (lọc theo `products.account_code` – nếu chưa có thì v1 ẩn)
- Đơn vị tính chính (lọc theo `unit`)
- "Có phát sinh giao dịch hoặc có tồn" (switch, mặc định bật)
- Preset kỳ: Năm nay / Quý / Tháng + 2 ô date `from`–`to`
- Nút **Tìm kiếm**, **Tạo phiếu xuất kho**, **Tính giá kho**, **Xuất báo cáo**

### Bảng 2 cấp
- Cấp 1 (rollup theo Kho): mỗi dòng = 1 warehouse + dòng "Tất cả". Click ▸ expand danh sách hàng hoá thuộc kho.
- Cấp 2 (chi tiết hàng hoá): Mã, Tên, ĐVT, Nhóm + các nhóm cột:
  - **Đầu kỳ**: SL, Giá trị, Giá TB
  - **Nhập kho**: SL, Giá trị, Giá TB
  - **Xuất kho**: SL, Giá trị, Giá TB
  - **Cuối kỳ**: SL, Giá trị, Giá TB
  - **LK Nhập kho**: SL, Giá trị (từ đầu năm tài chính → `to`)
  - **LK Xuất kho**: SL, Giá trị
- Filter ô "Từ – Đến" trên header mỗi cột số (range filter client-side)
- Empty state: "Không có dữ liệu"

### Hành động dòng
- Nút mở **Thẻ kho** (icon) → điều hướng `/inventory/stock-card?product=:id&from=&to=`
- Nút **Xem chi tiết hàng hoá** → `/inventory/$id`

## 5. Các tab mới

### 5.1 Phiếu chưa nhập/xuất kho (`/inventory/unposted`)
- Dùng `listMovements({ status: "unposted" })` (đã có)
- Cột: Ngày, Số CT, Loại (Nhập/Xuất/Chuyển), Kho, Hàng hoá, SL, Đơn giá, Giá trị, Lý do
- Hành động: **Ghi sổ** (post – mở dialog xác nhận, gọi `recordMovement`/`createStockVoucher` đã có), **Sửa**, **Huỷ**

### 5.2 Phiếu nhập/xuất kho gộp (`/inventory/vouchers`)
- Dùng `listStockVouchers` (đã có) — thêm tham số `type?: 'in'|'out'|'all'`
- Cột: Ngày, Số CT, **Loại** (badge), Kho, Đối tượng, Tổng SL, Tổng giá trị, Trạng thái (đã ghi sổ / chưa), Người tạo, Hành động (Xem/Sửa/Huỷ)
- Header: tabs/filter pill `Tất cả | Nhập | Xuất` + 2 nút tạo

### 5.3 Chuyển kho (`/inventory/transfers`)
- Bảng các phiếu chuyển kho (lọc `movement_type='transfer'`, hiện đang chưa có loại này → bổ sung)
- Form tạo: Ngày, Số CT (auto), Kho xuất, Kho nhập, dòng hàng (Hàng hoá, SL, Đơn giá lấy từ giá vốn kho xuất)
- Khi ghi sổ: tạo cặp movement `out` (kho nguồn) + `in` (kho đích), không ảnh hưởng giá vốn bình quân toàn DN (chỉ chuyển giữa kho)

## 6. Server functions cần bổ sung / sửa

- `getInventoryReport({ from, to, warehouse_ids?, account_codes?, unit?, only_with_activity? })`
  - Trả `{ by_warehouse: WarehouseRollup[], by_product_in_warehouse: Row[], cumulative: { in, out } }`
  - Tính cả LK từ `01-01-<year(to)>` đến `to`
- Mở rộng `listStockVouchers` để chấp nhận `type: 'in'|'out'|'all'`
- `recomputeInventoryValuation({ to })` cho nút "Tính giá kho" — chạy lại bình quân gia quyền theo thứ tự `movement_date`, ghi `unit_cost`, `products.unit_cost`
- `createStockTransfer({ date, from_warehouse_id, to_warehouse_id, lines[], note })` + `listStockTransfers({ from, to })`
- Bổ sung enum `movement_type='transfer'` (migration nếu cột là check constraint)

## 7. Schema/Migration cần xác nhận
- Kiểm tra constraint `stock_movements.movement_type` có chấp nhận `'transfer'` chưa; nếu không, thêm.
- (Tuỳ chọn) Thêm cột `products.account_code` (default 156) nếu muốn lọc theo tài khoản — **v1 bỏ qua** nếu chưa cấp thiết.

## 8. Phạm vi không làm (v1)
- Không thay đổi form Phiếu nhập / Phiếu xuất hiện tại (chỉ gộp danh sách)
- Không đổi cách tính giá vốn ngoài nút "Tính giá kho"
- Không build lại "Thẻ kho" — chỉ chuyển vào nút mở từ báo cáo
- Không hỗ trợ ghim cột / kéo thả cột (UI clone đơn giản hơn ảnh)

## 9. Tệp dự kiến tạo/sửa
- Sửa: `src/routes/_app/inventory.tsx` (đổi tab — gộp nhập/xuất)
- Viết lại: `src/routes/_app/inventory/index.tsx` (báo cáo NXT 2 cấp)
- Thêm: `src/routes/_app/inventory/vouchers.tsx`, `src/routes/_app/inventory/unposted.tsx`, `src/routes/_app/inventory/transfers.tsx`
- Xoá/redirect: `src/routes/_app/inventory/vouchers-in.tsx`, `vouchers-out.tsx`
- Sửa: `src/lib/inventory.functions.ts` (thêm `getInventoryReport`, `recomputeInventoryValuation`, mở rộng `listStockVouchers`)
- Thêm: `src/lib/stock-transfers.functions.ts`
- Migration: cho phép `movement_type='transfer'`

## 10. Thứ tự triển khai
1. Migration `movement_type='transfer'`
2. Server fns: `getInventoryReport`, `createStockTransfer`, `recomputeInventoryValuation`, mở rộng `listStockVouchers`
3. Layout tab + đổi tên + thêm route mới (gộp nhập/xuất)
4. Trang báo cáo NXT 2 cấp (cấp 1 rollup, cấp 2 chi tiết, LK)
5. Tab Phiếu nhập/xuất gộp + Tab Phiếu chưa nhập/xuất
6. Tab Chuyển kho (list + form tạo + ghi sổ)
7. Nút "Tính giá kho" + "Xuất báo cáo" (gọi `exportStockIOSummaryXlsx`, mở rộng để xuất kèm cột LK)
