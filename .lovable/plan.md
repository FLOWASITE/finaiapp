# Ẩn PageBreadcrumbs trong /chat

## Vấn đề
Sau khi tách 2 sidebar độc lập, `PageBreadcrumbs` luôn render trong `<main>` ở mọi route — bao gồm cả `/chat`. Trên trang chat, breadcrumb chiếm thêm chiều cao phía trên khung chat, làm vướng và đẩy khung `h-[calc(100vh-7rem)]` không khớp.

## Thay đổi

### `src/routes/_app.tsx`
- Tính `onChatRoute = location.pathname.startsWith("/chat")` (đã có).
- Chỉ render `<PageBreadcrumbs />` khi **không** ở `/chat`:
  ```tsx
  {!onChatRoute && <PageBreadcrumbs />}
  ```
- Header + AppSidebar vẫn giữ nguyên (đã hoạt động độc lập).

### `src/routes/_app/chat.tsx`
- Khung chat hiện dùng `h-[calc(100vh-7rem)]` — chiều cao này được tính giả định có header (~5rem) + padding. Sau khi ẩn breadcrumb, không cần đổi vì breadcrumb trước đó nằm trong `<main>` (đã scroll cùng main), nhưng để chắc khung chat không bị tràn/scroll thừa, vẫn giữ `h-[calc(100vh-7rem)]` — kiểm tra trực quan sau khi triển khai. Nếu cần điều chỉnh, đổi thành `h-full` và để `<main>` lo chiều cao.

## Phạm vi
Chỉ thay đổi điều kiện render `PageBreadcrumbs` trong `_app.tsx`. Không động vào logic nào khác.
