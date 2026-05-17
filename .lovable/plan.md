# Kế hoạch: Sidebar hiện đại – phá cách – AI-first

Mục tiêu: nâng cấp sidebar AccuVN hiện tại (tĩnh, phẳng, danh sách link đơn giản) thành một "command surface" hiện đại, có chiều sâu thị giác và tích hợp AI ngay trong sidebar.

## Tham chiếu thiết kế (research)
- **Linear / Vercel / Raycast**: sidebar tối, dày dặn, group có thể thu gọn, phím tắt, command palette ⌘K luôn nổi bật trên cùng.
- **Notion / ChatGPT**: ô "Ask AI" lớn, gợi ý prompt nhanh, lịch sử hội thoại pin lên đầu.
- **Vercel Geist / Arc Browser**: collapsible rail (mở rộng khi hover), section dividers mảnh, micro-animation khi active.
- **MISA AMIS / FAST**: giữ nhóm chức năng kế toán truyền thống (Mua–Bán, Kho–Quỹ, Sổ–Thuế) để kế toán viên không bị lạc.

## Hướng thiết kế đề xuất
1. **Layout & cấu trúc**
   - Dùng `Sidebar` của shadcn với `collapsible="icon"` → mặc định 240px, thu gọn còn 56px (icon-only), có `SidebarTrigger` ở header.
   - Header sidebar: logo "A" gradient + tên AccuVN + badge phiên bản nhỏ.
   - 3 vùng dọc: **AI zone** (trên) · **Navigation groups** (giữa, cuộn) · **User card** (dưới).

2. **AI zone – điểm phá cách**
   - Khối "Ask AccuVN" nổi: nền gradient mềm (`--gradient-primary`), shadow `--shadow-elegant`, input giả lập + phím tắt ⌘K.
   - Click → mở Command Dialog (cmdk) với: tìm trang, hỏi AI, lệnh nhanh ("Tạo phiếu thu", "BCTC tháng này"…).
   - 2–3 "AI suggestions" động bên dưới (chip pill, icon Sparkles) – mock tĩnh ở phase này, hook vào dữ liệu sau.
   - Link nhanh "Trợ lý AI" → `/chat`.

3. **Navigation groups**
   - Collapsible group (Mua–Bán / Kho–Quỹ / Sổ–Thuế) – nhớ trạng thái mở theo route active.
   - NavItem: icon trong khung bo nhẹ, active state dùng thanh accent trái + nền `bg-accent/10`, animation `fade-in` + scale icon.
   - Badge số (vd: HĐ chờ duyệt) bên phải, dùng token semantic.
   - Khi collapsed: chỉ icon + tooltip (shadcn Tooltip), giữ accent strip.

4. **User card (dưới)**
   - Avatar + email + role chip, menu dropdown: Hồ sơ / Cài đặt / Đăng xuất.
   - Indicator "Lovable Cloud" online (chấm xanh pulse).

5. **Visual system**
   - Bổ sung token trong `src/styles.css`: `--sidebar-bg`, `--sidebar-accent`, `--gradient-ai`, `--shadow-ai-card`.
   - Hỗ trợ light/dark. Phá cách = nền hơi tối hơn main (`oklch` lệch ~3%), border gần như vô hình, dùng inner-shadow thay border ở AI card.
   - Animation: `animate-fade-in` cho group, `hover-scale` cho AI card, transition 200ms cho collapse.

6. **Tương thích & a11y**
   - Phím tắt ⌘K / Ctrl+K mở command palette toàn app.
   - aria-label đầy đủ, focus ring rõ ràng, keyboard nav cho group expand.
   - Responsive: <768px chuyển sang `Sheet` (offcanvas) với cùng nội dung.

## Phạm vi kỹ thuật
- Refactor `src/routes/_app.tsx` để dùng `SidebarProvider` + component `AppSidebar` mới tại `src/components/app-sidebar.tsx`.
- Tạo `src/components/sidebar/ai-launcher.tsx` (AI card + cmdk dialog) và `src/components/sidebar/user-card.tsx`.
- Cài `cmdk` (đã có qua shadcn `command`) – kiểm tra, nếu chưa có thì thêm `bun add cmdk`.
- Thêm tokens vào `src/styles.css` (không đổi palette gốc, chỉ thêm biến).
- KHÔNG đổi business logic, KHÔNG đổi routes hiện có.

## Ngoài phạm vi (phase sau)
- AI suggestions thật từ dữ liệu (cần serverFn riêng).
- Pin/sắp xếp menu theo người dùng (cần bảng `user_preferences`).
- Đa ngôn ngữ.

## Câu hỏi trước khi build
1. Tone màu: giữ light mặc định hay làm sidebar **dark mode-only** (kiểu Linear/Vercel) để tạo cảm giác phá cách?
2. AI launcher: chỉ là **command palette ⌘K** hay kèm **mini-chat inline** (gõ câu hỏi ngay trong sidebar, kết quả mở `/chat`)?
3. Có cần **collapsible icon-rail** (thu gọn còn 56px) ngay phase này không?
