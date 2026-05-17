## Mục tiêu
Chuyển sidebar hiện tại (nền tối xanh đậm) sang style **light "GOGO Admin"** giống ảnh tham chiếu:
- Nền trắng tinh (`#fff`), viền phải mảnh xám.
- Item: chữ xám đậm `slate-700`, icon line mảnh, hover nền xám rất nhạt.
- Item **active**: chữ đen + icon đen, **không** dùng pill nền — chỉ một dấu indicator nhỏ bên trái (mũi tên `→` hoặc thanh dọc 2px đen).
- Group label: chữ in hoa, size 10–11px, màu xám nhạt `slate-400`, letter-spacing rộng (giống "SALES & INVENTORY", "ACCOUNTING", "INSIGHTS").
- Item con cấp 2 (vd. Invoices dưới Sales): thụt vào ~16px, có gạch trái mảnh, active hiện mũi tên `→` trước label.
- Badge số ở cuối hàng (vd. Sales `9`, Invoices `4`) — pill xám tròn, chữ nhỏ.
- AI launcher rút gọn thành một ô input giả "Describe what you want to create..." ở footer, không gradient nổi bật; bỏ chip "Quick AI".
- Header logo: square nhỏ kèm tên app "AccuVN" + tag user "Anh Trading JSC" (dropdown switcher) — giữ TenantSwitcher hiện có.

## Phạm vi thay đổi

### 1. `src/styles.css`
Đổi token sidebar (chỉ phần `:root`, dark giữ nguyên):
```
--sidebar: oklch(1 0 0);                       /* trắng */
--sidebar-foreground: oklch(0.32 0.02 260);    /* slate-700 */
--sidebar-accent: oklch(0.97 0.005 250);       /* hover xám nhạt */
--sidebar-accent-foreground: oklch(0.18 0.03 260);
--sidebar-border: oklch(0.92 0.008 250);       /* viền xám */
--sidebar-primary: oklch(0.2 0.02 260);        /* active = đen */
--sidebar-primary-foreground: oklch(1 0 0);
--sidebar-ring: oklch(0.7 0.04 260);
```
Bỏ `--shadow-elegant` nền sidebar nếu có ảnh hưởng.

### 2. `src/components/app-sidebar.tsx`
- **Header**: bỏ gradient AI ở logo square — đổi thành ô vuông `bg-foreground text-background` chữ "A". Tag dưới đổi từ "AI Accounting · v3" thành neutral "Accounting Suite".
- **AI launcher block**: rút gọn về 1 nút text "Hỏi AccuVN AI…" style input (border xám, nền trắng, không gradient). Bỏ section "QUICK_AI chips".
- **NavLink**:
  - Bỏ thanh `bg-sidebar-primary` bên trái khi active.
  - Active state: icon + text `text-foreground font-medium`, prefix `→` (ký tự hoặc icon `ChevronRight` size 12) cho item con.
  - Hover: `bg-sidebar-accent/60`.
  - Icon dùng `h-4 w-4 stroke-[1.5]` (mảnh hơn).
- **Group label**: class `text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/60 px-3 pt-4 pb-1`.
- **Sub-items**: thêm cấp 2 cho "Bán hàng" và "Mua hàng" (Estimates, Invoices, Receipts, Credit notes / Bills, Payments) — render thụt lề với border-left mảnh. *(Phase 1 chỉ cần style; mục cấp 2 có thể trỏ tới route hiện hữu hoặc placeholder.)*
- **Badge số**: thêm prop `badge?: number` cho `NavLeaf`; render `<span className="ml-auto rounded-full bg-muted px-1.5 text-[10px] text-muted-foreground">`.
- **Footer user**: giữ dropdown, đổi nền hover sang xám nhạt, bỏ pulse dot xanh.

### 3. Không động vào
- Logic auth, role, command palette behavior.
- Các route khác.
- Dark mode (giữ nguyên token `.dark`).

## QA
- Light mode: sidebar trắng giống ảnh, không còn nền tối.
- Active item (`/dashboard`) hiện đen đậm + mũi tên, các item khác xám.
- Group label "BÁN HÀNG", "MUA HÀNG", "KẾ TOÁN TỔNG HỢP"… in hoa nhỏ, mờ.
- Mobile 360–768: sidebar collapse vẫn hoạt động, icon-only mode chuẩn.
- Dark mode bật thử: vẫn dùng token cũ → không vỡ.

## Các bước thực hiện
1. Cập nhật token `:root` trong `src/styles.css`.
2. Refactor `app-sidebar.tsx`: header, AI launcher, NavLink active style, group label, badge, sub-items.
3. Kiểm tra preview ở 707px (current viewport) và desktop.
