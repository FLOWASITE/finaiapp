## Mục tiêu
Hoàn thiện UI hai luồng "khai báo & đặt tổ chức":
1. Trang `/settings` — lưới shortcut + tab "Tổ chức" (hero, banner, form 4 section).
2. Dialog "Tạo tổ chức mới" trong `tenant-switcher`.

Phạm vi: chỉ UI/UX/responsive — không đổi logic lưu, không đổi schema, không đổi server function.

---

## 1. Lưới shortcut ở đầu trang Cài đặt
Vấn đề: 7 nút cùng cấp, hai nút highlight (`Hoạt động & Mặt hàng`, `Khai báo mặt hàng`) trộn lẫn với nút phụ → khó quét mắt; mobile bị chật.

Đổi sang **bố cục 2 nhóm có nhãn**:
- "Khai báo trọng yếu" (nổi bật, card lớn icon trái + tiêu đề + mô tả 1 dòng): Hoạt động & Mặt hàng, Khai báo mặt hàng, Kỳ kế toán.
- "Cơ cấu tổ chức" (nút outline gọn): Chi nhánh, Phòng ban, Dự án, Bộ phận chi phí.
- Grid: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` cho card lớn; `grid-cols-2 sm:grid-cols-4` cho nút phụ.

## 2. Tab "Tổ chức"

### 2.1 Hero card
- Avatar 14×14 → giữ; thêm cụm meta phải: MST · Loại hình · Trạng thái hồ sơ (badge `pct%`).
- Nút hành động trong hero: "Cập nhật từ MST" (nếu có tax_id) và "Đổi logo" (kéo từ section Branding lên cho dễ thấy).
- Trên mobile xếp dọc, badge xuống dòng dưới tên.

### 2.2 Banner & thông báo
- Gộp banner "chưa hoàn tất" + chip "đã hoàn tất" thành **một thanh trạng thái thống nhất**: progress bar mảnh + text trạng thái + CTA Wizard. Khi 100% → biến thành dải xanh mảnh có icon check, không chiếm chỗ.
- Card "Đồng bộ Trí nhớ AI" thu lại thành banner mảnh (1 dòng, icon + link), bỏ màu indigo cứng → dùng token `accent`/`muted`.

### 2.3 SectionNav
- Hiện chỉ desktop. Thêm phiên bản **tab cuộn ngang dính trên** cho mobile (`sticky top-0`, chip nhỏ, scroll-snap), dùng cùng dữ liệu `SECTIONS`.
- Mỗi mục thêm chấm trạng thái: xanh khi đủ trường bắt buộc của section, hổ phách khi thiếu.

### 2.4 Các section form
- Đồng nhất `CardHeader`: thêm dòng mô tả ngắn dưới CardTitle (vì sao cần khai báo).
- Trong "Hồ sơ pháp lý": gom cụm MST + nút "Cập nhật từ MST" + checkbox "ghi đè" vào **một panel viền nhạt** thay vì dải hint dài; checkbox đổi thành Switch nhỏ kèm tooltip.
- "Liên hệ & Địa chỉ": switch "địa chỉ giao hàng riêng" đổi sang dạng toggle inline trong header section, gọn hơn khối border-dashed.
- "Cấu hình kế toán": chia thành 2 nhóm con có label nhỏ — "Chuẩn & tiền tệ" / "Kê khai thuế" — để giảm cảm giác form dày.
- "Người đại diện": chuyển 2 cụm (pháp luật / kế toán trưởng) sang **Accordion** mặc định mở cụm 1, đóng cụm 2 — giảm scroll.
- "Thương hiệu & Chữ ký": preview chữ ký/logo trên nền giả lập hoá đơn nhỏ để biết hiển thị thực tế.

### 2.5 Sticky save bar
- Thanh hành động cố định đáy (đã có pb-24): cải tiến hiển thị số trường thay đổi, nút "Hoàn tác" + "Lưu" + đếm lỗi nếu có trường required trống.
- Trên mobile full-width, chia 2 nút bằng nhau.

## 3. Dialog "Tạo tổ chức mới"

- Mở rộng `DialogContent` → `sm:max-w-lg` (hiện mặc định hơi chật cho block "Đã lấy từ MST").
- Thứ tự lại các bước: (1) Nhập MST → tra cứu; (2) Khối "Đã lấy từ MST" hiện ngay dưới input MST khi có dữ liệu (thay vì cuối dialog) để người dùng thấy giá trị trước khi sửa; (3) Các trường còn lại pre-fill, có icon nhỏ "đã lấy tự động" bên cạnh.
- "Tên hiển thị" thêm hint "Dùng trong menu chọn tổ chức — thường viết tắt".
- Validation inline: nút Tạo disabled như cũ + hiển thị lý do (Tooltip "Cần điền Tên pháp nhân & Tên hiển thị").
- Footer: thêm checkbox "Đặt làm tổ chức đang dùng sau khi tạo" (mặc định bật) — chỉ UI, gọi `switchTenant` ngay sau `createTenant` thành công (đã có invalidate, chỉ thêm 1 call).
- Mobile: dialog full-screen sheet (`max-h-[100dvh]` + scroll trong body).

## 4. Responsive tổng thể
- `max-w-5xl` của trang → đổi `max-w-6xl` để section nav 220px + form không bị bóp ở 1280–1440.
- Tabs cuộn ngang giữ nguyên; thêm gradient mờ 2 mép cho biết có thể cuộn.
- Mọi `grid-cols-2` form trên màn `<400px` → 1 cột (đã có `md:grid-cols-2`, kiểm tra lại cụm Hồ sơ pháp lý/Liên hệ).

## 5. Token & nhất quán
- Bỏ màu hardcode `#C7D2FE / #EEF2FF / #4F46C7` trong card AI Memory → dùng `bg-accent / text-accent-foreground / border-accent`.
- Banner amber dùng `bg-warning/10 border-warning/40 text-warning-foreground` nếu token tồn tại, fallback giữ amber nhưng qua biến CSS đã có trong `styles.css`.

---

## File sẽ chỉnh
- `src/routes/_app/settings/index.tsx` — lưới shortcut, hero, banner, SectionNav mobile, accordion section "Người đại diện", sticky save bar, token màu.
- `src/components/tenant-switcher.tsx` — chỉ phần `CreateTenantDialog`: layout, thứ tự, mobile sheet, checkbox "đặt làm active", + 1 call `switchTenant` sau tạo.
- (nếu cần) `src/components/settings-section-nav.tsx` — thêm biến thể `variant="chips"` cho mobile.

Không đụng: server functions, schema, tax-id-lookup, logic `applyLookup`, các tab khác của Settings.

## Kiểm thử nhanh sau khi build
- Desktop 1440 & 1280: lưới shortcut 2 nhóm, SectionNav dính, sticky save.
- Mobile 390: tab cuộn ngang, SectionNav chip, dialog tạo tổ chức full-screen.
- Tạo tổ chức mới với MST hợp lệ → thấy block "Đã lấy từ MST" ngay dưới input; sau khi tạo tự switch sang tổ chức mới.