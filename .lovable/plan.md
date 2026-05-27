# Plan — VSIC 2025 Industry Picker

## ✅ Phase 1 — UI Picker (hoàn thành)
- `src/lib/vsic-2025.ts` — 22 L1 + helpers
- `src/components/industry/VsicIndustryPicker.tsx` — multi-select, drill-down, search non-accent
- Tích hợp Settings (`_app/settings/index.tsx`) + Setup (`_app/setup.tsx`)

## ✅ Phase 2 — Full dataset L1-L4 (hoàn thành)
- Nạp dataset theo **Quyết định 36/2025/QĐ-TTg** (hiệu lực 15/11/2025):
  - 22 L1 (đầy đủ)
  - 88 L2 (đầy đủ)
  - 158 L3 (chọn lọc — top DN-relevant)
  - 91 L4 (chọn lọc — top DN-relevant)
- L5 bỏ qua (743 mã quá chi tiết cho SMB; cấp 4 đã đủ).
- Cập nhật `VSIC_2025_LEVEL1` cho khớp tên K (mới) và V (mới).
- Thêm `VSIC_2025_META` (source, effectiveDate).
- Footer popover hiển thị nguồn QĐ.

## Giữ nguyên
- `src/components/industry-combobox.tsx` — vẫn dùng trong `EditIndustryDialog`
- `src/lib/vsic.ts` — `LEGAL_FORMS`, `TAX_METHODS`, `DECLARE_PERIODS`
- DB schema, server functions (shape `{code, name}` không đổi)
