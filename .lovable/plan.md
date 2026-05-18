
## Mục tiêu

Tái cấu trúc `src/components/app-sidebar.tsx` để điều hướng được nhóm theo dạng **collapsible groups** giống ảnh tham chiếu: mỗi mục cha (Items, Sales, Purchases, Contacts, Financial, Cash & Banking…) có mũi tên `›` / `⌄`, click để mở/đóng danh sách con. Các section header lớn (SALES & INVENTORY, ACCOUNTING, INSIGHTS) dùng làm nhãn phân vùng.

## Cấu trúc nhóm mới

```
— (top-level)
  Tổng quan (Home)
  Trợ lý AI
  Cài đặt nhanh (Settings shortcut)

SALES & INVENTORY
  ▸ Hàng hoá (Items)
      • Tồn kho
      • Thẻ kho / Phát sinh
      • Kiểm kê
      • Danh mục
  ▸ Bán hàng (Sales)
      • Bán hàng (Tổng quan)
      • Hoá đơn bán
      • Phiếu thu
      • Công nợ phải thu
  ▸ Mua hàng (Purchases)
      • Mua hàng (Tổng quan)
      • Hoá đơn mua
      • Phiếu chi
      • Công nợ phải trả
  ▸ Đối tác (Contacts)
      • Khách hàng
      • Nhà cung cấp

ACCOUNTING
  ▸ Tài chính (Financial)
      • Sổ nhật ký
      • Hệ thống tài khoản
      • Tài sản cố định
      • Tiền lương
      • Thuế
  ▸ Tiền & Ngân hàng (Cash & Banking)
      • Quỹ tiền mặt
      • Đối soát ngân hàng

INSIGHTS
  • Báo cáo tài chính
  • Sổ sách kế toán

HỆ THỐNG
  • Quản trị
  • Cài đặt
  • Super Admin (nếu có quyền)
```

Lá đơn (Reports, Settings) vẫn render phẳng như cũ.

## Triển khai kỹ thuật

1. **Type model mới** trong `app-sidebar.tsx`:
   ```ts
   type NavLeaf = { to: string; label: string; icon: React.ElementType; badge?: number };
   type NavGroup = { label: string; icon: React.ElementType; defaultOpen?: boolean; items: NavLeaf[] };
   type NavSection = { label: string; entries: Array<NavLeaf | NavGroup> };
   ```
   Phân biệt group vs leaf bằng `"items" in entry`.

2. **Collapsible group** dùng `@/components/ui/collapsible` (`Collapsible`, `CollapsibleTrigger`, `CollapsibleContent`) kết hợp `SidebarMenuItem` + `SidebarMenuButton` + `SidebarMenuSub` / `SidebarMenuSubItem` / `SidebarMenuSubButton` đã có sẵn trong `src/components/ui/sidebar.tsx`. Trigger hiển thị icon + label + `ChevronRight` xoay 90° khi mở (`group-data-[state=open]/collapsible:rotate-90`).

3. **State mở/đóng**:
   - `defaultOpen` = group chứa route đang active (tính từ `pathname`).
   - Lưu trạng thái user toggle vào `localStorage` key `sidebar:groups:v1` (map `groupLabel -> boolean`) để giữ giữa các lần load.

4. **Active highlight**:
   - Leaf: như hiện tại (`isActive`, vạch trái).
   - Group cha: thêm style nhạt khi 1 trong các con đang active (badge dot hoặc `text-sidebar-primary`).

5. **Trạng thái collapsed (icon-only)**:
   - Khi sidebar collapsed, group trigger chỉ hiện icon, click sẽ mở popover (dùng `SidebarMenuButton` với `tooltip` + `DropdownMenu` chứa các sub item) — pattern chuẩn shadcn.

6. **Section headers** (`SALES & INVENTORY`, `ACCOUNTING`, `INSIGHTS`, `HỆ THỐNG`) tiếp tục dùng `SidebarGroupLabel` với typography đã có (`text-[10px] tracking-wider`).

7. **Giữ nguyên**: header (logo + AI launcher + quick chips), footer (user dropdown), CommandDialog (cập nhật flatten list để search vẫn ra mọi leaf trong các group).

## File thay đổi

- `src/components/app-sidebar.tsx` — viết lại phần `SECTIONS` và render logic cho group/leaf, thêm hook quản lý open state + persist localStorage.

Không đụng `_app.tsx`, không đổi route, không tạo file mới.

## Phạm vi không làm

- Không thêm tính năng badge số liệu thực (chỉ chừa trường `badge?` để dùng sau nếu cần).
- Không đổi màu / theme tổng thể.
- Không refactor route hay tạo trang mới (các leaf hiện chưa có route như `/invoices`, `/payables`… vẫn trỏ đến route hiện hữu tương ứng đã thấy trong `src/routes/_app/`).
