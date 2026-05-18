## Bỏ khu vực AI Launcher trên Sidebar

Xoá toàn bộ vùng nằm trong khung đỏ ở ảnh chụp:
- Ô "Hỏi FinAI AI… ⌘K"
- 3 nút gợi ý nhanh: "Tóm tắt doanh thu tháng này", "Lập BCTC quý gần nhất", "Top 5 công nợ quá hạn"

### Thay đổi kỹ thuật
File: `src/components/app-sidebar.tsx`
- Xoá block `<div className="px-2 pt-3 pb-2">…</div>` (vùng AI launcher + quick AI chips) trong `SidebarContent`.
- Xoá hằng `QUICK_AI` không còn dùng.
- Xoá state `openCmd` / `setOpenCmd`, handler phím tắt Cmd/Ctrl+K, và `<CommandDialog>` đi kèm nếu không còn tham chiếu nào khác (kiểm tra lại trước khi xoá để tránh phá tính năng search).
- Dọn các import không còn dùng (`Sparkles`, `Command as CommandIcon`, các Command* nếu CommandDialog bị xoá).

### Không thay đổi
- Header, branding, theme toggle.
- Các section menu (Vận hành, Kế toán, Hệ thống, v.v.).
- Sidebar riêng cho Thuế / Báo cáo / HĐĐT đã làm trước đó.
