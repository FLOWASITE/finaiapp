## Mục tiêu
Bỏ hoàn toàn breadcrumbs khỏi header. Người dùng định vị bằng sidebar (mục đang chọn được highlight) và tiêu đề H1 ở đầu mỗi trang.

## Thay đổi

**`src/components/app-header.tsx`**
- Xoá khối breadcrumbs (thẻ `<nav>` "Trang chủ / …") và hàm `useBreadcrumbs`, hằng `SEGMENT_LABELS`, import `useMatches`, `ChevronRight`.
- Đẩy cụm phải (Kỳ kế toán, Quick links HĐĐT/Thuế/Báo cáo, Search, Notifications, User) chiếm toàn bộ chiều ngang header (bỏ `ml-auto`, dùng `justify-end` cho container, hoặc đơn giản giữ nguyên cụm phải và để wrapper `flex flex-1 justify-end`).

**`src/routes/_app.tsx`** *(tuỳ chọn nhỏ)*
- Không cần đổi gì; header vẫn cố định như hiện tại.

## Không thay đổi
- Không sửa các trang con — tiêu đề H1 đã có sẵn trên từng route (vd "Tổng quan", "Hoá đơn điện tử"…).
- Sidebar giữ nguyên highlight mục đang chọn để người dùng biết mình đang ở đâu.

## Kết quả
Header gọn hơn, chỉ còn: tenant switcher · kỳ kế toán · quick links · tìm kiếm · thông báo · user. Vị trí trang được nhận biết qua sidebar + tiêu đề trang.