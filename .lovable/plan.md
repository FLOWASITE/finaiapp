# Hoàn thiện UI · Superadmin · AI Model

Mục tiêu: trang `/superadmin/ai-model` trông gọn, hiện đại và "đáng tin" hơn — không thay đổi logic backend / server functions.

## Phạm vi
Chỉ chỉnh `src/routes/_app/superadmin/ai-model.tsx` (frontend, presentation). Không động vào `ai-config.functions.ts`, schema DB, secrets.

## Thay đổi UI

### 1. Hero gọn lại + status mạch lạc
- Bỏ gradient nặng, đổi sang card viền mỏng + chấm trạng thái màu (xanh = active, vàng = thiếu setup, xám = fallback Lovable AI).
- Hàng meta hiển thị: Provider · Base URL (rút gọn domain) · Model mặc định — dạng inline pill, dễ scan.
- Switch "Bật custom" gắn nhãn phụ ("Tắt → dùng Lovable AI").

### 2. Preset card chuẩn hoá
- 2 card cùng kích thước, có logo chữ (OR / 通义) trong ô vuông bo tròn để phân biệt nhanh.
- Mỗi card: tên + 1 dòng mô tả + meta nhỏ (số model gợi ý, cần header? cần region?).
- Nút áp preset chuyển thành full-width ở đáy card; Alibaba: 2 nút region dạng segmented (Intl | CN) thay vì 2 nút outline rời.
- Card đang dùng: viền primary + nền nhạt + dấu check ở góc.

### 3. Tabs gọn hơn
- TabsList full width trên mobile, max-w-md trên desktop (giữ).
- Thêm icon nhỏ + sub-label dưới mỗi tab khi ≥ md (vd: "Provider · key & URL").

### 4. Tab Provider
- Khối API key nổi bật hơn: card con với icon khoá lớn bên trái, badge "đã lưu (AES-GCM)" + nút "Xoá key" gọn (icon trash) thay cho checkbox đỏ.
- Hiển thị helper text dưới base URL: parse host và show "→ openrouter.ai" để xác nhận trực quan.

### 5. Tab Models
- Header tab: input search nhanh model + filter "Chỉ miễn phí" + nút "Tải danh sách" — đặt thành 1 toolbar.
- 4 `ModelField` sắp xếp 2x2 (giữ) nhưng đổi thành card nhỏ có nền `muted/30`, label hoa hồng nhạt + icon ở góc, hiện badge giá / context bên dưới input.
- Khi chưa load models: hiện empty state nhỏ ("Tải danh sách để chọn từ dropdown") thay vì để Popover ẩn im lặng.

### 6. Tab Nâng cao
- Extra headers: thêm nút "Format JSON" + cảnh báo inline khi parse fail (live, không cần lưu).
- Ghi chú nội bộ: counter ký tự.

### 7. Sticky action bar
- Thu gọn padding, thêm nền blur + shadow nhẹ.
- Test result chuyển thành chip màu (success / error) thay vì text dài; click để xem chi tiết trong popover.
- Nút "Lưu" disable khi form không có thay đổi (so với `data.config`).

### 8. Tinh chỉnh chung
- Spacing nhất quán: `space-y-4` giữa các Card; padding card `p-5` → `p-4` ở mobile.
- Dùng `text-foreground/muted-foreground` thay cho mọi màu cứng (kiểm tra dark mode).
- Thêm transition mượt cho preset card (`transition-colors`).

## Không đổi
- Logic save / test / list models.
- Cấu trúc `FormState`, presets `OPENROUTER_PRESET` / `ALIBABA_PRESETS`.
- Validation JSON khi submit.

## Kiểm tra sau khi xong
- Load trang → hero hiển thị đúng 3 trạng thái (active / thiếu setup / disabled).
- Áp preset OpenRouter / Alibaba Intl / Alibaba CN → fields fill đúng, card highlight đúng.
- Tab Models: tải list, lọc free, chọn model từ dropdown.
- Sticky bar: Save disable khi không có thay đổi, enable khi sửa field.
- Dark mode: contrast OK trên hero, preset card, sticky bar.
