## Mục tiêu

Cải tiến thẩm mỹ cho `ThreadList` (sidebar lịch sử chat trong `/chat`) theo hướng **Sleek glassmorphic**: nền tối sâu hơn, viền mờ trong suốt, item bo tròn 12px, active state có thanh accent + nền glow nhẹ, hover mượt mà, typography rõ ràng hơn.

## Phạm vi

Chỉ chỉnh sửa **UI/CSS**. Không động đến logic, server functions, hay dữ liệu.

**Files thay đổi:**
- `src/components/chat/thread-list.tsx` — restyle header, search, bucket label, thread item, active state, dropdown trigger.
- `src/styles.css` — thêm vài token sidebar mới (`--chat-sidebar-bg`, glow active dùng primary thay vì accent xanh lá để hợp với prototype xanh dương).

## Các thay đổi chi tiết

### 1. Container sidebar
- Nền: `bg-[oklch(0.08_0.02_260)]` tối sâu hơn, có border phải `border-white/5` thay vì `border-border/40`.
- Bo tròn nhẹ ở mép phải trên/dưới khi không collapsed.

### 2. Header
- Logo "Sparkles" giữ nguyên gradient AI, kích thước 8x8, bo `rounded-lg`.
- Title "Trợ lý kế toán" giữ; subtitle nhỏ hơn, màu `text-slate-500`.
- Nút toggle dùng `hover:bg-white/5`, icon `text-slate-400 hover:text-white`.
- Nút "Cuộc trò chuyện mới" → đổi sang style **ghost trong suốt với icon Plus**, full-width, `bg-white/[0.03] border-white/10 hover:bg-white/[0.06]`, text trắng, icon primary nhỏ.

### 3. Search input
- `bg-white/[0.04] border-white/[0.06] rounded-xl`, focus: `ring-1 ring-primary/40 bg-white/[0.08]`.
- Icon search đổi màu khi focus (group-focus-within).
- Nút "X" xoá glow nhẹ hơn.

### 4. Filter "Chỉ hiện sao"
- Pill nhỏ, khi active: `bg-amber-500/10 text-amber-300 border border-amber-500/20`.

### 5. Bucket label
- `text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500`.
- Spacing trên 16px giữa các bucket (`space-y-6`).

### 6. Thread item (KEY change)
- Padding `px-3 py-2.5`, bo `rounded-xl`.
- **Inactive:** text `text-slate-400`, hover `bg-white/[0.04] text-slate-100`, transition mượt.
- **Active:** nền `bg-primary/10 border border-primary/20`, text trắng, **thanh accent bên trái** `absolute left-0 top-3 bottom-3 w-[2px] bg-primary rounded-full` (thay vì h-6 cũ).
- Icon `MessageSquare` ẩn đi (gọn hơn theo prototype) — chỉ giữ title + meta time.
- Time stamp: `text-[10px] text-slate-500/70`, không indent 22px nữa.
- Star/Pin icons nhỏ hơn, đặt inline với title.

### 7. Dropdown trigger (more)
- Chỉ hiện khi hover/open: `opacity-0 group-hover:opacity-100`.
- `hover:bg-white/10 text-slate-400 hover:text-white`.

### 8. Empty state
- Icon `MessageSquare` lớn hơn (h-10 w-10), màu `text-slate-700`.
- Text căn giữa, line-height thoải mái.

### 9. Collapsed state
- Hai nút icon (toggle + new chat) căn giữa dọc, hover `bg-white/5`.
- Nút "new" giữ accent primary nhẹ.

### 10. styles.css
- Thêm `.chat-history-scroll` scrollbar thinner (4px), thumb `oklch(1 0 0 / 0.06)`.
- Không thay đổi token toàn cục.

## Acceptance

- Sidebar lịch sử chat trông tối hơn, gọn hơn, item active có thanh primary + glow nhẹ.
- Hover state mượt, không nhấp nháy.
- Mọi chức năng hiện tại (rename, pin, star, delete, search, filter sao, collapse) hoạt động nguyên vẹn.
- Collapsed mode vẫn dùng được.
- Không đụng business logic hay backend.
