
## Mục tiêu

Tái cấu trúc trang `/inbox` cho khớp ảnh tham chiếu: bỏ kiểu "list + Sheet pop‑up", chuyển sang **bố cục 3 cột cố định** kế toán nhìn được mọi thứ cùng lúc. Chỉ chỉnh UI; không đổi logic duyệt / skip / rule / server functions.

## Bố cục mới (desktop ≥ lg)

```text
┌───────── Header (giữ nguyên) ─────────┐
│  Stats strip + "Duyệt tất cả tin cậy cao (n)"  │
│  Tabs: Inbox AI · Đã hạch toán · Cần xem lại · Tài liệu · Báo cáo │
├──────────────────────────────────────┤
│ FilterBar (pill row, full width)     │
├────────────┬───────────────┬─────────┤
│ List (380) │ Invoice (1fr) │ Fin (420)│
│ ItemCard   │ FilePreview   │ Proposal │
│ ItemCard   │  (XML/PDF)    │ Reasons  │
│ …          │               │ Composer │
│            │               ├─────────┤
│            │               │ Duyệt ▸  │  (action bar dính đáy cột phải)
└────────────┴───────────────┴─────────┘
```

- 3 cột scroll độc lập, `min-h-0 overflow-y-auto`.
- < lg: giữ behaviour cũ (list full-width + mở `InboxItemSheet` như hiện tại).

## Thay đổi chi tiết

### 1) FilterBar (mới, trong `src/routes/_app/inbox.tsx`)
Pill nhóm theo ảnh, thay cho FilterBar cũ:
- Nhóm trạng thái: **Tất cả · Đã ghi sổ · Chưa ghi** (map sang `filterPosted`).
- Nhóm loại: **Mọi loại · Bán · Mua** (map sang `filterKind`).
- Nhóm sắp xếp **mới**: **Mới nhất · Số tiền · Tin cậy** (`sortBy` state local, sort `filteredItems`).
- Ô tìm kiếm bên phải: placeholder `Số phiếu (BH/PX) hoặc số HĐ…`, badge `shown/total` (vd `40/40`).
- Pill dùng `rounded-full border` + active = `bg-foreground text-background`.

### 2) ItemCard (chỉnh `src/routes/_app/inbox.tsx`)
- Bỏ rail màu trái nhiều màu; dùng border + dot tin cậy nhỏ ở góc phải.
- Hàng 1: badge `HOÁ ĐƠN VÀO` (outline cam) + badge nhỏ `Hóa đơn vào` + meta `29 phút trước · HĐ 2691 · 26/01/2026`. Bên phải: pill trạng thái `Sẵn sàng duyệt` + dòng số tiền lớn `60.000 đ`.
- Hàng 2: tiêu đề đối tác (1 dòng, truncate).
- Hàng 3: mô tả ngắn (memo / chi tiết hoá đơn).
- Hàng 4: chip tài khoản dạng `Nợ 642 · 55.556` / `Có 331 · 60.000` (đã có data trong `proposal.lines`).
- Footer card: nút phụ `Tổng chi cho {partner} năm nay?` mở `openAskAi(...)`.
- Card chọn (`active`) = `border-primary bg-primary/5`, không dùng ring nặng.

### 3) Cột giữa — Invoice viewer
- Tạo component nhỏ `InboxInvoicePane` (cùng file) hiển thị:
  - Header: `HOÁ ĐƠN MUA` + tên file XML/PDF ở phải.
  - Khung preview dùng `<InvoiceFileViewer/>` đã có (`src/components/invoice-viewer/invoice-file-viewer.tsx`).
  - Toolbar: nút `Xem lớn`, badge loại `GTGT`, pill `ĐÃ KÝ SỐ` (xanh) nếu `meta.signed`.
  - Khi chưa chọn item → empty state mascot + "Chọn một mục bên trái".

### 4) Cột phải — Đề xuất của Fin
Tách `ItemResolutionPanel` hiện có thành layout dọc giống ảnh:
- Header: `Đề xuất của Fin` · `TIN CẬY {n}%` (màu theo band) · `PHIẾU MUA HÀNG` (theo `voucher_kind`).
- Khối đối tác: tên, MST nhỏ, số tiền lớn bên phải có dấu `+`, mốc thời gian.
- Nút `Xem hoá đơn` (mở file viewer fullscreen).
- Khối cảnh báo "CẦN TẠO MỚI VÀO HỆ THỐNG" (giữ nguyên data, đổi style banner amber + hàng `Nhà cung cấp / Hàng hoá …` với 2 nút `Sửa` / `Tạo mới`).
- `BÚT TOÁN ĐỀ XUẤT` + badge `CÂN BẰNG`, bảng `Nợ/Có · TK · mô tả · số tiền` + nút `+ Nợ` `+ Có`.
- Hàng chip kiểm tra: `OCR đã đọc đầy đủ`, `Tổng chi cho {partner} năm nay?`.
- `Lý do đề xuất:` 1 đoạn + chip nguồn (`Phân loại / Đã đọc đủ / Hồi tác MỚI / cần tạo`).
- Khối `LỊCH SỬ TRAO ĐỔI VỚI AI` (placeholder) + nút `Hỏi AI về mục này`.
- **Action bar dính đáy cột**: thanh xanh `Duyệt & ghi sổ` (primary), nút `Sửa`, nút `Bỏ qua`, có composer 1 dòng `Hỏi trợ lý AI bất cứ điều gì…` ngay dưới (mở `openAskAi`).

### 5) Bỏ Sheet ở desktop
- Desktop ≥ lg không mở `InboxItemSheet` nữa; thay bằng `selectedItem` set trực tiếp cột phải.
- Mobile/tablet giữ `InboxItemSheet` cũ để không vỡ trải nghiệm hẹp.

### 6) Misc
- Thêm sort `sortBy: "recent" | "amount" | "confidence"` trong state.
- Mặc định chọn item đầu tiên khi `filteredItems` thay đổi nếu chưa có lựa chọn.
- Persist độ rộng 3 cột bằng `grid-cols-[380px_minmax(0,1fr)_420px]`; ẩn cột giữa nếu không có file (`xl:` breakpoint), fallback 2 cột.

## File ảnh hưởng

- `src/routes/_app/inbox.tsx` — bố cục 3 cột, FilterBar mới, ItemCard mới, chọn item không mở Sheet ở desktop.
- `src/components/inbox/item-resolution-panel.tsx` — refactor sang layout dọc theo ảnh (giữ props hiện tại).
- (Mới) sub‑component `InboxInvoicePane` nội bộ trong `inbox.tsx` dùng lại `InvoiceFileViewer`.
- Không đổi: server functions, mutations, `inbox-item-sheet.tsx` (giữ cho mobile).

## Không nằm trong phạm vi

- Không đổi schema, server fn, OCR, agents.
- Không sửa các tab khác (Đã hạch toán / Cần xem lại / Tài liệu / Báo cáo).
- Không thêm logic "Tạo mới đối tác/hàng hoá" thực — nút `Tạo mới` chỉ wire UI (có thể `toast.info('Sắp ra mắt')` nếu chưa có endpoint).
