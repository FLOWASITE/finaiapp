## Hoàn thiện UI Inbox AI

Áp dụng hướng "Premium fintech" đã chọn cho card trong danh sách Inbox AI, đồng thời bổ sung 2 thông tin user yêu cầu: **ngày hoá đơn** và **loại hàng hoá/dịch vụ**.

### Phạm vi
Chỉ chỉnh frontend, 1 file: `src/routes/_app/inbox.tsx` — hàm `ItemCard` (dòng ~806–925). Không đụng business logic, server function, hay database. Dữ liệu đã có sẵn trong `item.proposal.meta.invoice_date` và `item.proposal.items` từ các pass trước.

### Thay đổi cụ thể

**1. Card container** — rounded-xl, shadow-sm → hover:shadow-md, border mềm hơn, thêm hover lift nhẹ. Rail confidence chuyển thành thanh bo tròn nổi (floating pill) thay vì `before:` pseudo cứng.

**2. Top meta row** — pill DOC uppercase + tracking-wide; thêm tách dấu • giữa các phần; **bổ sung ngày HĐ** (icon Calendar + `dd/mm/yyyy`) đọc từ `proposal.meta.invoice_date`.

**3. Title + amount** — title `text-[14px] font-bold uppercase line-clamp-2`; amount `text-[17px] font-bold tabular-nums`, đơn vị "đ" nhạt hơn.

**4. Dòng hàng hoá/dịch vụ (mới)** — đọc `proposal.items[]`; hiển thị tên item đầu tiên truncate, kèm `+N mục` nếu có nhiều dòng. Dấu chấm nhỏ làm bullet.

**5. Journal pills** — nâng cấp pill bút toán:
- NỢ: nền indigo nhạt + viền indigo, label "NỢ" indigo-500, số TK indigo-900, separator dọc indigo-200, số tiền indigo-700.
- CÓ: nền muted + viền border, giữ tone trung tính.
- Cả hai dùng `tabular-nums` cho số tiền.

**6. Giữ nguyên** — blocker/followup banner, badge "Đang chat", badge match_ref, dot confidence band, prop signature (`item`, `active`, `onClick`, `registerRef`) — không ảnh hưởng phần còn lại của page.

### Kết quả
Card sang hơn, phân cấp thị giác rõ (NCC vs số tiền), người dùng thấy ngay ngày HĐ + loại hàng hoá ngay trên list mà không cần mở sheet.
