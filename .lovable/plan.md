# Plan — Bổ sung ngành VSIC 2025 + UI Chọn ngành (Settings & Setup)

## ✅ Đã hoàn thành (Phase 1)

1. **`src/lib/vsic-2025.ts`** — Dataset VSIC 2025:
   - 22 ngành L1 đầy đủ (icon lucide, finaiSupported, finaiOverlaySlug, nonBusiness)
   - ~110 mã L2-L5 phổ biến nhất (seed cho SMB Việt Nam)
   - Helpers: `getChildren`, `getAncestors`, `lookupVsic`, `inferLevel`, `getL1CodeOf`, `searchVsic` (tìm không dấu, score-based)

2. **`src/components/industry/VsicIndustryPicker.tsx`** — Component mới:
   - Multi-select chips với badge "Chính" + nút "Đặt chính"
   - Popover picker 640px: search bar + L1 grid (22 card icon+mô tả) → drill-down L2→L5 với breadcrumb
   - Toggle "Hiện/Ẩn ngành ngoài DN" (P/U/V)
   - Search non-accent từ 2 ký tự
   - Badge "Hỗ trợ FinAI" (sparkles) trên 6 ngành có overlay

3. **Tích hợp:**
   - `src/routes/_app/settings/index.tsx` — section "Hoạt động kinh doanh"
   - `src/routes/_app/setup.tsx` — wizard onboarding (đồng bộ `industry_code/name` từ ngành chính)

4. **Tương thích:** Giữ shape `{code, name}` khi lưu xuống DB → không cần migration server.

## 🔜 Phase 2 (cần input)

Upload file dataset chính thức VSIC 2025 (xlsx/csv ~1.584 mã L2-L5 đầy đủ từ TCTK) → script parse sẽ generate phần còn lại của `VSIC_2025_NODES`. Cấu trúc đã sẵn sàng, chỉ append.

## File giữ nguyên
- `src/components/industry-combobox.tsx` — vẫn dùng trong `EditIndustryDialog` (gắn ngành NCC)
- `src/lib/vsic.ts` — `LEGAL_FORMS`, `TAX_METHODS`, `DECLARE_PERIODS` còn dùng nhiều nơi
