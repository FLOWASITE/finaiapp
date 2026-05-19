# Sổ AI — Fullscreen + Redesign theo mockup

## 1. Bỏ chrome (sidebar + header) cho /inbox

Trong `src/routes/_app.tsx`:
- Nhận diện route `/inbox` → render `<Outlet />` full-bleed, không bọc `SidebarProvider`/`AppSidebar`/`<header>`/`PageBreadcrumbs`.
- Vẫn giữ guard `beforeLoad` (auth redirect) và `ChatDock`/`CommandPalette` nếu cần (theo mockup không có dock — sẽ tắt luôn).
- Các route khác giữ nguyên layout cũ.

Cách triển khai gọn: tách `AppLayout` thành 2 nhánh `chromeless` vs `chrome`, quyết định bằng `location.pathname === "/inbox"`. Khi chromeless: chỉ `<main className="h-screen w-full overflow-hidden"><Outlet/></main>`.

## 2. Dựng lại `src/routes/_app/inbox.tsx` theo mockup

### 2.1 Header riêng của trang (thay app header)
- Trái: icon vuông "S" + tiêu đề "Sổ AI" + pill xanh nhạt "● AI đang xử lý".
- Giữa: ô command ⌘K hiển thị gợi ý: `Hỏi AI: "Chi phí marketing tháng này?", "Đối chiếu HĐ với sao kê"…`
- Phải: pill "📅 T11/2025" + nút ⋯.

### 2.2 Stats strip
3 cụm số liệu + 1 CTA, cách nhau bằng vạch dọc mờ:
- **Chờ duyệt** — `47` (số lớn).
- **AI đã hạch toán hôm nay** — `132` + chip xanh `↑ tiết kiệm ~4h`.
- **Độ chính xác** — `98.4%`.
- Bên phải: nút outline **`✓ Duyệt tất cả tin cậy cao (32)`** (đếm theo band `high`).

### 2.3 Tabs
`Inbox AI 47 · Đã hạch toán · Cần xem lại · Tài liệu · Báo cáo` — đổi thứ tự theo mockup, badge số chỉ ở tab đang hoạt động (underline thay vì pill đen như hiện tại). Bỏ filter band riêng — nút "Duyệt tất cả tin cậy cao" thay thế nó.

### 2.4 Card mỗi item (left rail màu theo confidence band)
Mỗi card có dải màu mỏng bên trái (`border-l-4`):
- 🟢 high → emerald, 🟡 medium → amber, 🔴 low → rose.

Bố cục bên trong card:
- **Hàng 1 (chips nhỏ):** pill nguồn `📄 Hóa đơn vào` / `🏦 Sao kê Vietcombank` / `🏦 Sao kê Techcombank` + dòng phụ `Tải từ Tổng cục Thuế · 2 phút trước`. Bên phải: badge `↔ Khớp HĐ 00125` (nếu có) + chấm tròn confidence (xanh/vàng/đỏ).
- **Hàng 2 (title + amount):** tiêu đề đậm trái (`FPT Telecom`, `CTY TNHH XYZ chuyển khoản`, …) + amount phải, dấu `+` cho tiền vào, `−` cho tiền ra, màu trung tính (không đổi màu theo dấu).
- **Hàng 3 (memo/subtitle):** ví dụ `Cước Internet T11 · HĐ 00128456` hoặc trích dẫn `"TT HD 125 thang 10 CTY XYZ"`.
- **Hàng 4 (proposed entry inline):** các pill `Nợ 642 2,450,000` `Nợ 133 245,000` `Có 331 2,695,000` — TK in đậm, số tabular. Pill nền `bg-muted/60`, font mono cho số.
- **Hàng 5 (blocker/warn — nếu có):** banner amber/rose: `💡 AI chưa rõ: chi phí bán hàng (641) hay quản lý (642)? Phân theo phòng ban?` hoặc `⚠ Cần cung cấp chứng từ. AI đã gửi tin cho Kế toán trưởng.`

Card đang chọn: dải trái dày hơn + nền `bg-accent/30`.

### 2.5 Footer danh sách
- Pill nhỏ `+ 43 mục khác` ở dưới (đếm = total − rendered).
- Floating button tròn ↓ ở góc phải dưới của cột danh sách (đã có sẵn — giữ lại, đổi vị trí cho khớp).

### 2.6 Reasoning panel (cột phải)
- Tiêu đề: `✨ AI LẬP LUẬN` chữ nhỏ uppercase.
- Đoạn lập luận tự nhiên với highlight in đậm các con số/đối tác/HĐ: `Khoản tiền vào **55tr ₫** từ **CTY XYZ** khớp với hóa đơn bán hàng **HĐ 00125** ngày 28/10 (cùng số tiền, đúng đối tác, ghi chú có mã HĐ).`
- Block `Bút toán đề xuất` nền xám nhạt, hiển thị dạng `Nợ 112 — TG Vietcombank          55,000,000` thay vì bảng (chỉ là 2-3 dòng text căn lề).
- Hàng signal pills bo tròn xanh: `✓ Khớp hóa đơn` `✓ Đối tác đã có` `✓ Pattern tương tự ×17` + pill cuối `Tin cậy 99%`.
- Bộ nút: **`✓ Duyệt & ghi sổ`** (lớn, nền emerald đậm, full width chính), `📝 Sửa` (outline), `×` (icon button, outline) — căn hàng ngang.
- Section `HỎI AI VỀ MỤC NÀY` — 3 nút ghost full-width:
  - `Tại sao lại là TK 131 mà không phải 511?`
  - `Tổng đã thu của XYZ là bao nhiêu?`
  - `Áp dụng quy tắc này cho mục tương lai` (giữ nguyên hành động `saveInboxRule`).

### 2.7 Bỏ
- `bandFilter` pills (thay bằng nút "Duyệt tất cả tin cậy cao").
- Checkbox chọn từng dòng + bulk bar (chỉ 1 nút duy nhất ở stats strip).
- `ScrollArea` hai cột → dùng `overflow-y-auto` thường để có scroll-shadow tự nhiên hơn.

## 3. Hành vi
- `Duyệt tất cả tin cậy cao (N)`: lặp `approveInboxItem` cho mọi item `confidence_band === "high"` và không có `blocker`.
- 3 câu "Hỏi AI" đầu: 2 câu đầu prefill `openAskAi("Giải thích vì sao …")` cho item đang chọn, câu thứ 3 gọi `saveInboxRule`.
- Số liệu stats (`47`, `132`, `98.4%`) lấy từ `data.stats` (đã có `pending`, `posted_today`; thêm `accuracy` tạm hiển thị `—` nếu null, không thêm backend mới).

## 4. Phạm vi không động tới
- Backend (`inbox-ai.functions.ts`, `inbox-reason.server.ts`) giữ nguyên.
- Sidebar/header ở các route khác giữ nguyên.
- Route cũ `inbox_.$lane.tsx` giữ — không link tới nữa nhưng không xoá để tránh vỡ deep-link cũ.

## 5. File chạm
- `src/routes/_app.tsx` — nhánh chromeless cho `/inbox`.
- `src/routes/_app/inbox.tsx` — viết lại UI (giữ logic query/mutate).
