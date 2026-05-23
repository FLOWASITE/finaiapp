# Rà soát module "Văn phòng"

## Đã xong
- Migration 4 nhóm bảng + RLS (prospects, client_links, contracts, tasks, templates, staff)
- Layout `_app/office` + sidebar + 6 tab (Dashboard, Clients, Contracts, Tasks, Staff, Templates)
- Server functions: prospects, client-links, contracts, tasks, task-templates, staff, dashboard
- Dialog tạo mới: Prospect, Client Link (search tenant FinAI), Contract, Task, Staff
- Cron sinh task định kỳ (pg_cron + function `office_generate_recurring_tasks`) + nút "Sinh ngay"
- Dashboard KPI cơ bản

## Còn thiếu so với plan

### 1. Convert prospect → client (quan trọng)
- Server fn `convertToClient` chưa có
- Nút "Chuyển thành khách hàng" trên prospect chưa có
- Cần: cho chọn tenant FinAI có sẵn để link, hoặc đánh dấu won + lưu `converted_tenant_id`

### 2. Dialog "Mời nhân viên vào sổ sách khách"
- Server fn `inviteStaffToClientTenant` đã có
- Thiếu UI dialog gọi nó (chọn staff + role) trên trang chi tiết client link

### 3. Kanban kéo-thả thực sự
- Trang tasks hiện chỉ là 4 cột tĩnh, chưa có drag-drop
- Cần cài `@dnd-kit/core` + `@dnd-kit/sortable` và bọc DndContext + gọi `moveStatus`

### 4. Trang chi tiết (drill-down)
Plan yêu cầu nhưng chưa có:
- `clients/$linkId.tsx` — info tenant + contracts + tasks + staff phụ trách + nút mời nhân viên
- `prospects/$id.tsx` — form lead + convert
- `contracts/$id.tsx` — chi tiết + gia hạn
- `tasks/$taskId.tsx` — drawer chi tiết (comments, attachments, checklist)
- `staff/$staffId.tsx` — hồ sơ + clients phụ trách + tải việc

### 5. Staff assignments
- Bảng `office_staff_assignments` đã có nhưng chưa có UI gán staff ↔ client link
- Thiếu `assignment-matrix.tsx`

### 6. Cảnh báo hợp đồng sắp hết hạn
- Server fn `listExpiring` chưa có
- Widget cảnh báo trên Dashboard chưa có
- Chức năng gia hạn (`renewContract` + bảng `office_contract_renewals`) chưa có UI

## Ưu tiên đề xuất (theo thứ tự build tiếp)
1. Convert prospect flow (#1) — đóng vòng lặp lead → khách
2. Trang chi tiết client `clients/$linkId` + dialog mời nhân viên (#2, một phần #4)
3. Kanban dnd-kit (#3)
4. Trang chi tiết task drawer (phần #4)
5. Cảnh báo hết hạn + gia hạn hợp đồng (#6)
6. Staff assignments matrix + trang chi tiết staff (#5, phần #4)

Xác nhận thứ tự hoặc chọn hạng mục muốn làm trước, tôi sẽ chuyển sang build.
