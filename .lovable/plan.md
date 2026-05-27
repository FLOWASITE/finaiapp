## Mục tiêu
Hoàn tất 2 yêu cầu UI cho màn "Danh mục hàng hóa, dịch vụ":
1. Thêm chế độ xem dạng **List** (bên cạnh Grid hiện tại) + toggle.
2. Xóa dòng "Cty TNHH Aurora F&B · TT 99" trên header.

## Thay đổi

### 1. `src/components/catalog/CatalogHeader.tsx`
- Xóa block hiển thị company name + `RegimeSwitch` (dòng `<div className="flex flex-wrap items-center gap-2 ...">`).
- Giữ lại `<h1>` tiêu đề.
- Thêm cụm điều khiển bên phải (cạnh nút "Tạo mới"): toggle 2 nút **Grid / List** (icon `LayoutGrid` + `List` từ lucide-react), bind vào `viewMode` / `setViewMode` của store. Nút active style `bg-[#0F6E56] text-white`, inactive `text-muted-foreground`.

### 2. `src/components/catalog/ItemList.tsx`
- Đọc `viewMode` từ store.
- Khi `viewMode === "list"`: render dạng bảng / hàng ngang thay vì grid cards.
  - Cấu trúc: `<div className="divide-y border rounded-lg">` chứa các row.
  - Mỗi row hiển thị compact 1 dòng: mã | tên | category badge | itemType badge | TK mặc định | VAT% | usage30d | actions (mở drawer).
  - Vẫn tôn trọng phân nhóm "Dùng gần đây" / "Khác" ở tab `mine`.
  - Tab `suggested`: list dùng layout đơn giản hơn nhưng vẫn cho phép "Thêm vào danh mục" inline.
- Khi `viewMode === "grid"`: giữ nguyên code hiện tại.
- Tách helper `<ItemListRow item={...} />` mới (file cùng thư mục hoặc inline) để giữ ItemList gọn.

### 3. (Tùy chọn) Vị trí `RegimeSwitch`
- Vì đang xóa khỏi header, chuyển `RegimeSwitch` xuống cạnh search bar hoặc bỏ hẳn khỏi trang này? **Đề xuất: bỏ khỏi trang Catalog** (regime là setting toàn cục, không cần thao tác ở đây). Nếu user muốn giữ, sẽ chuyển vào Settings sau.

## Phạm vi không đụng
- Không sửa store thêm (đã có `viewMode` + `setViewMode` từ pass trước).
- Không sửa DB, server functions, filter/search/category logic.
- Không sửa ItemCard / drawer.

## Câu hỏi xác nhận
- `RegimeSwitch` — **bỏ hẳn khỏi trang Catalog** hay **chuyển sang vị trí khác** (ví dụ cạnh search)? Mặc định plan này sẽ **bỏ hẳn**.
