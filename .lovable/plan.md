# Hiện công tắc "AI ↔ Kế toán" trên điện thoại

## Vấn đề
`WorkspaceSwitcher` (nút chuyển giữa **Mode AI** và **Mode Kế toán**) đang dùng class `hidden md:flex`, nên chỉ hiện trên màn hình ≥ 768 px. Trên điện thoại (viewport ~707 px) nó bị ẩn hoàn toàn, người dùng không có cách nào đổi mode.

## Mục tiêu
Trên mobile vẫn thấy và bấm được công tắc AI ↔ Kế toán, nhưng nhỏ gọn để không chiếm chỗ header (vốn đã có Tenant, Period, Notifications, Avatar).

## Phương án
Trong `src/components/workspace-switcher.tsx`:
- Bỏ `hidden md:flex` → đổi thành `flex` (luôn hiện).
- Trên mobile: chỉ hiện **icon** (LayoutGrid / BookOpenCheck), ẩn chữ "AI" / "Kế toán" bằng `hidden sm:inline`. Tăng vùng chạm (padding `px-2`).
- Từ `sm:` trở lên: giữ nguyên giao diện hiện tại (icon + chữ).
- Thêm `aria-label` cho từng nút để truy cập tốt hơn (đang chỉ có `title`).

Không động vào logic `useWorkspace`, không thêm state mới, không ảnh hưởng các trang/route khác.

## File thay đổi
- `src/components/workspace-switcher.tsx` (chỉ class + thêm `aria-label`).
