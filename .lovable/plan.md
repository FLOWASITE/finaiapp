## Mục tiêu
Gọn lại nhóm **Tài sản cố định** trên sidebar (workspace "Kế toán"): hiện có 9 mục con chiếm rất nhiều chỗ. Chỉ giữ **1 mục duy nhất** cho TSCĐ và **chuyển các mục báo cáo** sang nhóm **Báo cáo**.

## Tình trạng hiện tại (sidebar "Kế toán", `src/components/app-sidebar.tsx` dòng 116–124)
```text
- Tài sản cố định           → /assets
- Sổ khấu hao               → /assets/books
- Bảng tính khấu hao        → /assets/depreciation
- Biến động tài sản         → /assets/events
- Thanh lý / Nhượng bán     → /assets/disposal
- Chuyển TSCĐ ↔ CCDC        → /assets/reclassify
- Kiểm kê tài sản           → /assets/inventory
- Tài sản phân bổ           → /assets/allocations
- Báo cáo TSCĐ              → /assets/reports
```
Trong nhóm **Báo cáo** (`REPORTS_SECTIONS`) đã có sẵn:
- `Tài sản cố định` → `/assets/reports`
- `Tài sản phân bổ` → `/reports/allocation-schedule`

## Thay đổi sidebar

**Nhóm "Kế toán"** — gom còn 1 dòng:
```text
- Tài sản cố định  → /assets
```
(xoá 8 entry còn lại khỏi sidebar; các trang vẫn tồn tại và truy cập được từ trang `/assets` hoặc URL trực tiếp)

**Nhóm "Báo cáo" (REPORTS_SECTIONS → "Kế toán")** — bổ sung các mục mang tính báo cáo của TSCĐ:
```text
- Bảng tính khấu hao   → /assets/depreciation   (mới)
- Sổ khấu hao          → /assets/books          (mới)
- Tài sản cố định      → /assets/reports        (giữ)
- Tài sản phân bổ      → /reports/allocation-schedule (giữ)
```

## Điều hướng nội bộ trang `/assets`
Trên trang danh sách `/assets` đã có các action liên quan; để người dùng không bị mất đường vào các trang còn lại (Biến động, Thanh lý, Chuyển loại, Kiểm kê, Phân bổ), thêm một thanh **quick links** ở đầu trang `/assets` với 5 nút dẫn tới:
- `/assets/events` — Biến động tài sản
- `/assets/disposal` — Thanh lý / Nhượng bán
- `/assets/reclassify` — Chuyển TSCĐ ↔ CCDC
- `/assets/inventory` — Kiểm kê
- `/assets/allocations` — Tài sản phân bổ

## Phạm vi không đụng tới
- Không xoá route nào trong `src/routes/_app/assets/`.
- Không thay đổi server functions, schema, hay business logic.
- Workspace **Front (AI)** và các sidebar khác (Thuế, eInvoice) không đổi.

## File sẽ sửa
- `src/components/app-sidebar.tsx` — rút gọn nhóm Kế toán và bổ sung mục TSCĐ vào REPORTS_SECTIONS.
- `src/routes/_app/assets/index.tsx` — thêm thanh quick links.