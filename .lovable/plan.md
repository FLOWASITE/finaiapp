# Hoàn thiện UI Chọn ngành VSIC

Chỉ đụng `src/components/industry/VsicIndustryPicker.tsx`. Dataset `vsic-2025.ts` và 2 nơi tích hợp (Settings, Setup wizard) giữ nguyên.

## Vấn đề phát hiện khi rà UI hiện tại

1. **Mật độ chữ quá nhỏ** — quá nhiều `text-[10px]/[11px]`, đọc mỏi mắt; hierarchy giữa mã/tên/level chưa rõ.
2. **Chip ngành đã chọn** — link "Đặt chính" như text underline yếu; không thấy badge FinAI-supported; thiếu tooltip cho mã đầy đủ khi truncate.
3. **L1 grid 2 cột × 22 mục** — phải scroll dài; không có nhóm khu vực (kinh doanh / phi kinh doanh); nút "Chọn ngành này" lẫn vào card khó bấm.
4. **Search bar** — toggle "Ẩn ngành ngoài DN" trông như ghost button thường, người dùng không biết tác dụng; không có nút clear (×) khi đã gõ; không có shortcut hint.
5. **Search results** — flat list, không group theo L1, khó scan khi 30 hit; không có highlight từ khoá khớp.
6. **Drill view** — CTA "Chọn ngành cấp N này" nằm sticky header nhưng styling default xanh, đè lên breadcrumb gây rối; con cấp dưới chỉ là button row, thiếu affordance "có ngành con / đây là lá".
7. **Footer meta** — text 10px center, ổn nhưng nên thêm số ngành thực tế (L1: 22, L2: 88, L3: 158, L4: 91) thay vì "~360".
8. **Trigger button** — khi đã chọn rồi, label "Thêm ngành" không hiển thị primary code; người dùng phải nhìn xuống chips.
9. **Empty state** — chỉ một dòng text mờ; thiếu illustration / quick-pick các ngành phổ biến (Bán lẻ, F&B, Sản xuất, Xây dựng, Tư vấn).
10. **A11y / keyboard** — search results & L1 grid dùng raw `<button>`/`<div onClick>`, không hỗ trợ arrow-key navigation như `cmdk`.

## Thay đổi đề xuất (UI-only)

### A. Selected chips
- Tách thành 2 hàng: **Ngành chính** (card lớn riêng, có icon to + badge FinAI) và **Ngành phụ** (chip nhỏ inline).
- Thay link "Đặt chính" bằng icon-button (ngôi sao) + tooltip "Đặt làm ngành chính".
- Thêm tooltip hiển thị tên đầy đủ + đường dẫn breadcrumb L1 → Ln khi hover chip bị truncate.

### B. Trigger
- Khi `value.length === 0`: button to hơn, dashed border, icon Sparkles + label "Chọn ngành nghề kinh doanh".
- Khi đã chọn: button compact "+ Thêm ngành phụ" (bớt "Chính: ABC" vì đã hiện trong card).

### C. Picker popover
- Width responsive: `w-[min(680px,calc(100vw-2rem))]` để không overflow mobile.
- Search bar: thêm nút clear (×) khi có text; toggle "Ngành ngoài DN" chuyển thành **Switch** nhỏ với label rõ, đẩy về phải.
- Thêm tabs nhẹ ở đầu: `[Tất cả]  [Phổ biến]  [FinAI hỗ trợ]` để filter L1 grid.

### D. L1 grid
- Group theo 2 section: "Ngành kinh doanh" (A–S, trừ P/U/V) và "Khác" (P/U/V) — chỉ render section "Khác" khi toggle bật.
- Card L1: clickable toàn card để drill; thêm pill `Chọn` riêng (size sm, variant outline) bên góc phải để chọn trực tiếp; FinAI sparkle move lên góc phải card.
- Highlight border khi card đã được chọn (giữ logic cũ).

### E. Search results
- Group theo L1 (heading section nhỏ với icon + tên L1).
- Highlight substring match trong tên (bold).
- Hiển thị level badge bằng pill màu (L1 primary / L2 secondary / L3-4 muted) thay vì text plain.
- Hiển thị path `A → 01 → 011` thay vì chỉ "Nông nghiệp (A)".

### F. Drill view
- Breadcrumb rút gọn ở giữa nếu quá dài.
- Tách CTA "Chọn cấp này" thành footer riêng dưới list, full-width primary button (rõ ràng, không nằm trong header rối).
- Mỗi child item: hiển thị icon `ChevronRight` nếu còn cấp con, icon `Check`/blank nếu là lá; click toàn item để drill, có button "Chọn" riêng bên phải.

### G. Footer meta
- Update text: `Theo QĐ 36/2025/QĐ-TTg · hiệu lực 15/11/2025 · 359 ngành (L1: 22, L2: 88, L3: 158, L4: 91)`.

### H. Accessibility
- Bọc search results + L1 grid trong `cmdk` `Command` để có arrow-key + Enter nav.
- Aria-labels cho icon-only buttons (Đặt chính, Xoá, Clear search).
- Focus ring rõ ràng (semantic `--ring`).

## Ngoài phạm vi (không làm trong turn này)
- Không đổi dataset, helpers, hoặc shape `{code, name}` lưu DB.
- Không đụng integration trong `setup.tsx` & `settings/index.tsx`.
- Không đổi semantic colors — chỉ dùng token có sẵn (`primary`, `muted`, `border`, `ring`).

## Câu hỏi trước khi build
- Bạn có muốn tôi thêm **section "Phổ biến"** (5–8 ngành SMB VN: 4711 Bán lẻ tổng hợp, 5610 Nhà hàng, 4321 Xây lắp điện, 6201 Lập trình, 6920 Kế toán/tư vấn thuế, 7311 Quảng cáo, 9620 Cắt tóc làm đẹp, 4933 Vận tải đường bộ) ngay đầu picker khi chưa search không? Nếu **có** thì tôi sẽ hardcode danh sách này trong component (không sửa dataset).
