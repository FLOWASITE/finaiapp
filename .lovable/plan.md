## Mục tiêu

Nạp toàn bộ dataset VSIC 2025 (L1: 22, L2: 88, L3: 158, L4: 91 — tổng ~359 nodes) từ JSON người dùng cung cấp vào `src/lib/vsic-2025.ts`, thay thế seed ~110 mã hiện tại. Component picker & integration giữ nguyên — chỉ swap dataset.

## Thay đổi

### 1. `src/lib/vsic-2025.ts`

- **Giữ nguyên:**
  - Type `VsicNode`, `VsicL1Industry`
  - Mảng `VSIC_2025_LEVEL1` (22 ngành A-V) — đã có đủ, chỉ cập nhật nameVi cho khớp Quyết định 36/2025 (vd. K mới: "HOẠT ĐỘNG VIỄN THÔNG; LẬP TRÌNH MÁY TÍNH…", V mới: "HOẠT ĐỘNG CỦA CÁC TỔ CHỨC VÀ CƠ QUAN QUỐC TẾ"). Giữ nguyên `icon`, `nameViShort`, `description`, `finaiSupported`, `finaiOverlaySlug`, `nonBusiness`.
  - Helpers: `getChildren`, `getAncestors`, `lookupVsic`, `inferLevel`, `getL1CodeOf`, `searchVsic`, `getVsicLevel1`, `getVsicNode`.

- **Thay thế:** mảng `VSIC_2025_NODES` — generate từ JSON người dùng:
  - 88 node L2 (parent = mã L1 chữ cái)
  - 158 node L3 (parent = mã L2 2 ký tự)
  - 91 node L4 (parent = mã L3 3 ký tự)
  - Mỗi node: `{ code, level, parentCode, nameVi }`
  - L5 bỏ qua (dataset không có)

- **Metadata mới:** thêm constant `VSIC_2025_META` (source, effective_date, completeness) để hiển thị footer trong picker (optional, sẽ thêm 1 dòng nhỏ).

### 2. `src/components/industry/VsicIndustryPicker.tsx`

- Hiển thị thêm 1 dòng meta nhỏ ở footer popover: "Theo Quyết định 36/2025/QĐ-TTg, hiệu lực 15/11/2025" — để user yên tâm đang dùng phiên bản mới.
- Không đổi logic nào khác.

### 3. `.lovable/plan.md`

- Đánh dấu Phase 2 hoàn thành (dataset đầy đủ L1-L4 từ Quyết định 36/2025).

## Không đụng

- `src/routes/_app/settings/index.tsx`, `src/routes/_app/setup.tsx` (đã tích hợp ở Phase 1)
- `src/components/industry-combobox.tsx` (vẫn dùng cho EditIndustryDialog)
- DB schema, server functions
