# Hoàn thiện UI chọn sản phẩm (Phiếu mua / Phiếu bán)

## Vấn đề hiện tại

Có **2 `ProductPickerCell` riêng** ở `src/routes/_app/purchases/vouchers.tsx` và `src/routes/_app/sales/vouchers.tsx` — trùng logic nhưng UI lệch nhau và thiếu nhiều UX cơ bản:

- Sales picker: popover 680px, 5 cột (Mã/Tên/ĐVT/Giá bán/Tồn) — không có loại sản phẩm, không có giá trị tồn.
- Purchase picker: popover 920px, 8 cột — quá rộng so với cell, một số cột (GT tồn, Giá xuất kho) ít dùng khi nhập mua.
- Cả hai đều thiếu:
  - Bàn phím (↑ ↓ Enter Esc), không highlight dòng đang focus.
  - Trạng thái Loading / Empty phân biệt rõ (chưa gõ vs. không có kết quả).
  - Badge "Loại sản phẩm" (Hàng hoá / NVL / CCDC / DV / TSCĐ) — rất quan trọng để KTV chọn đúng.
  - Cảnh báo tồn = 0 khi bán; cảnh báo "không bán/không mua" được lọc nhưng không hiển thị lý do.
  - Nút **"+ Tạo sản phẩm mới"** ngay trong popover khi tìm không thấy.
  - Hiển thị mã + tên gọn trong cell sau khi chọn (hiện chỉ show 1 string `value`).
  - Footer tóm tắt: tổng kết quả, gợi ý phím tắt.

## Giải pháp

### 1. Tạo component dùng chung `src/components/vouchers/ProductPickerCell.tsx`

Một component duy nhất, prop `mode: "purchase" | "sales"` để đổi cột & filter:

```text
┌─ [ô input cell] mã + tên (truncate) ──────────────┐
│ click → popover 760px                              │
├────────────────────────────────────────────────────┤
│  🔍 Tìm theo mã / tên / mã vạch…    [↑↓ Enter]    │
├────────────────────────────────────────────────────┤
│ Mã      Tên sản phẩm           Loại    ĐVT  Giá   │  ← sticky
│ ──────────────────────────────────────────  Tồn   │
│ SP001   Bánh quy AFC      [Hàng hóa]  Hộp  25.000 │ ← row có
│                                              120  │   badge loại
│ SP002   Dịch vụ vận chuyển [Dịch vụ]   —    —     │
│ ...                                                │
├────────────────────────────────────────────────────┤
│ 12 sản phẩm · ↑↓ chọn · Enter xác nhận · Esc đóng │
│                          [+ Tạo sản phẩm mới…]    │
└────────────────────────────────────────────────────┘
```

**Cột theo mode:**

| Cột          | Purchase | Sales |
|--------------|:--------:|:-----:|
| Mã           | ✓        | ✓     |
| Tên          | ✓        | ✓     |
| Loại (badge) | ✓        | ✓     |
| ĐVT          | ✓        | ✓     |
| Giá mua gần nhất | ✓    | —     |
| Giá bán      | —        | ✓     |
| Tồn kho      | ✓        | ✓ (đỏ khi = 0) |

Bỏ hai cột "GT tồn" và "Giá xuất kho" ở Purchase — ít dùng khi đang nhập phiếu, để picker gọn.

### 2. UX nâng cấp

- **Bàn phím**: ↑ ↓ di chuyển highlight, Enter chọn, Esc đóng, Tab giữ focus trong popover. Tự cuộn dòng highlight vào viewport.
- **Tìm kiếm**: debounce 120ms; hỗ trợ tìm theo mã vạch (`barcode`) nếu có. Highlight đoạn khớp trong tên.
- **Trạng thái**:
  - Đang tải: skeleton 5 dòng (không phải spinner full).
  - Rỗng + chưa tìm: hiển thị 50 sản phẩm dùng nhiều nhất (sort theo `usage_count` nếu có; fallback theo `code`).
  - Rỗng + có query: `EmptyState` "Không tìm thấy "<q>"" kèm CTA **+ Tạo sản phẩm "<q>"** (mở `ItemCreateDialog` với name prefill).
- **Badge loại sản phẩm**: dùng `Badge` của shadcn với màu semantic — `hàng hoá` (default), `dịch vụ` (secondary), `NVL/CCDC` (outline), `TSCĐ` (warning tone).
- **Cảnh báo**:
  - Sales + tồn ≤ 0 → cột Tồn highlight `text-destructive`, tooltip "Hết tồn".
  - Purchase + sản phẩm `can_be_purchased=false` → không lọc bỏ mà disable dòng + tooltip "Không cho phép mua".
- **Cell hiển thị sau khi chọn**: `[SP001] Bánh quy AFC` — mã in mono, tên truncate, có nút × xoá nhanh khi hover.
- **Width**: popover dùng `min-w-[720px] max-w-[92vw]` để không tràn trên cell hẹp; align="start" giữ nguyên.

### 3. Tích hợp

- Xoá `ProductPickerCell` cục bộ trong cả 2 file vouchers, import từ `@/components/vouchers/ProductPickerCell`.
- Giữ nguyên contract `onPick(product)` để không phải sửa logic line.
- Sales hiện truyền `products` prop từ ngoài → đổi sang dùng `useQuery` nội bộ (cùng `queryKey: ["products-picker"]`) như Purchase để cache dùng chung và không phải prefetch ở parent.
- Hook nút "+ Tạo sản phẩm" vào `ItemCreateDialog` đã có (`src/components/catalog/ItemCreateDialog.tsx`), prefill `name = query`; sau khi tạo xong, refetch `products-picker` và auto-select sản phẩm mới.

## Phạm vi không đụng

- Không đổi server fn `listProducts`, không đổi schema, không đổi logic tính tiền/hạch toán dòng.
- Không đổi layout tổng của trang Phiếu mua / Phiếu bán — chỉ thay cell picker.

## Files dự kiến chạm

- ➕ `src/components/vouchers/ProductPickerCell.tsx` (mới, ~260 dòng)
- ✏️ `src/routes/_app/purchases/vouchers.tsx` (xoá ~100 dòng cục bộ, thêm 1 import)
- ✏️ `src/routes/_app/sales/vouchers.tsx` (xoá ~90 dòng cục bộ, thêm 1 import; bỏ prop `products`)
