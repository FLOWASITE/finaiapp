
## Mục tiêu

1. Bổ sung dataset VSIC 2025 đầy đủ **5 cấp** (22 / 87 / 259 / 495 / 743 mã).
2. Thay combobox phẳng `IndustryCombobox` hiện tại bằng UI mới rõ ràng hơn — **chọn 1 ngành cấp 1 làm primary** + **drill-down L2→L5 (tuỳ chọn)** + **multi-select nhiều ngành** với 1 ngành chính.
3. Áp dụng tại **Settings tổ chức** (`/settings` → section "Hoạt động kinh doanh") và **Setup wizard** (`/setup`).

Không động vào DB schema (cột `industries jsonb` đang dùng đủ chứa `{code, name, level, parent}`); không đổi business logic phân loại Hàng hóa/Dịch vụ.

---

## 1. Dataset VSIC 2025 — `src/lib/vsic-2025.ts`

Tạo file mới với:

- **L1 (22 ngành)** — copy nguyên từ spec người dùng cung cấp (code A–V, `nameVi`, `nameViShort`, `nameEn`, `description`, `icon` lucide, `finaiSupported`, `finaiOverlaySlug`).
- **L2-L5 (~1.584 mã)** — dạng mảng phẳng:
  ```ts
  export interface VsicNode {
    code: string;          // "01" | "011" | "0111" | "01110"
    level: 2 | 3 | 4 | 5;
    parentCode: string;    // "A" cho L2, "01" cho L3, ...
    nameVi: string;
  }
  export const VSIC_2025_NODES: VsicNode[] = [ ... ];
  ```
- Helper: `getChildren(parentCode)`, `getAncestors(code)`, `searchVsic(query)` (search theo code + nameVi, có dấu / không dấu, score-based).

**Nguồn dữ liệu L2-L5:** đây là phần lớn nhất của task. Hai cách:

- **(A) Người dùng upload file** danh mục VSIC 2025 chính thức (xlsx/csv từ TCTK / Quyết định 27/2018 + sửa đổi 2025). Mình parse bằng skill xlsx, sinh `vsic-2025.ts` tự động qua script.
- **(B) Mình tự tổng hợp** từ Quyết định 27/2018/QĐ-TTg (1.642 mã VSIC 2018, gần đầy đủ; rồi patch các thay đổi VSIC 2025: tách K khỏi J, thêm V…). Cách này nhanh hơn nhưng mã sửa đổi 2025 có thể không 100% khớp.

> Mình đề xuất (A) để đảm bảo chính xác. Trong plan này sẽ bao gồm script parse + sinh file; bạn chỉ cần upload file nguồn 1 lần.

---

## 2. Component mới — `src/components/industry/VsicIndustryPicker.tsx`

Thay thế `IndustryCombobox` (giữ file cũ để tránh vỡ chỗ khác — `EditIndustryDialog` vẫn dùng).

### UI / UX

- **Bước 1 — Chọn ngành cấp 1 (primary):**
  Lưới card 22 ngành, mỗi card gồm icon lucide + `nameViShort` + 1 dòng mô tả. Badge "Hỗ trợ FinAI" trên 6 ngành `finaiSupported=true`. Card P/U/V (gov, hộ gia đình, quốc tế) ẩn theo mặc định, có toggle "Hiện ngành ngoài DN".
- **Bước 2 — (Tuỳ chọn) chi tiết hoá:**
  Sau khi chọn L1, hiện một panel "Chi tiết ngành (tuỳ chọn)" với combobox dạng cascader: L2 → L3 → L4 → L5. Người dùng có thể dừng ở bất kỳ cấp nào. Mỗi cấp render breadcrumb code + tên.
- **Multi-select:**
  Cho phép thêm nhiều ngành (1 chính + N phụ), giống `IndustryCombobox multi` hiện tại. Ngành đầu = chính, có thể đổi bằng nút "Đặt làm chính". Hiển thị chips với code + nameViShort + level badge.
- **Search nhanh:** ô input ở đầu lọc toàn bộ 22 + drill-down qua tên/code không dấu.

### Props
```ts
type IndustrySelection = {
  code: string;            // L1..L5
  level: 1|2|3|4|5;
  nameVi: string;
  l1Code: VsicL1Code;      // luôn lưu để FinAI dùng overlay
};
type Props = {
  value: IndustrySelection[];
  onChange: (v: IndustrySelection[]) => void;
  disabled?: boolean;
  allowNonBusiness?: boolean;   // default false → ẩn P/U/V
};
```

---

## 3. Tích hợp

### `src/routes/_app/settings/index.tsx` (~dòng 873-894)
- Thay `<IndustryCombobox multi ... />` bằng `<VsicIndustryPicker value={form.industries} onChange={...} />`.
- Mapping `form.industries`: chuyển struct cũ `{code, name}` → mới `{code, level, nameVi, l1Code}`. Thêm migration runtime: nếu item cũ thiếu `level/l1Code` thì suy ra từ độ dài code (1 ký tự = L1, 2 = L2, 3 = L3, 4 = L4, 5 = L5) và lookup `parentCode` để tìm L1.

### `src/routes/_app/setup.tsx` (~dòng 220)
- Thay block `IndustryCombobox` single + ô input `industry_code` thủ công bằng `VsicIndustryPicker` (giới hạn 1 item ở bước onboarding). Lưu `form.industry_code` = code đã chọn, `form.industry_name` = nameVi, đồng thời thêm `form.industry_level` + `form.industry_l1_code` vào payload `updateTenant`.

### Server function `updateTenant` (nếu cần)
- Nếu schema validation hiện tại chỉ chấp nhận `industry_code` ≤ 6 ký tự thì OK (mã VSIC tối đa 5 ký số). Cần check `src/lib/tenants.functions.ts` xem schema có cho `industries` array kiểu mới không — nếu cần mở rộng kiểu, sẽ làm trong cùng PR.

### Không đổi
- `src/components/ai-memory/graph/EditIndustryDialog.tsx` vẫn dùng `IndustryCombobox` cũ (single, mục đích gắn ngành cho NCC khác hẳn). Giữ nguyên.
- Không đổi DB schema. Không đổi `categorize/classify-context.server.ts` (đang đọc `industries` jsonb — vẫn tương thích).

---

## 4. Thứ tự thực hiện

1. (Cần input) Bạn upload file VSIC 2025 đầy đủ (xlsx/csv). Mình viết script parse → `src/lib/vsic-2025.ts`.
2. Tạo `VsicIndustryPicker` + sub-components (`L1Grid`, `CascaderL2L5`, `SelectedChips`).
3. Tích hợp vào `settings/index.tsx` + `setup.tsx`, kèm migration runtime cho dữ liệu cũ.
4. Smoke test: chọn ngành mới trong Settings, reload, chọn drill-down L3, đổi ngành chính, xoá ngành phụ.

## Ghi chú kỹ thuật

- Bundle size: 1.6k entry × ~80 bytes ≈ **~130KB JS**. Chấp nhận được vì chỉ load khi mở Settings/Setup. Có thể `lazy import` `VSIC_2025_NODES` chỉ khi mở picker để tránh ảnh hưởng route initial.
- File `src/lib/vsic.ts` hiện tại (50 mã rút gọn + `LEGAL_FORMS`, `TAX_METHODS`, `DECLARE_PERIODS`) **giữ nguyên** vì các const khác vẫn còn dùng nhiều nơi. Chỉ array `VSIC` cũ sẽ được đánh dấu `@deprecated`.
