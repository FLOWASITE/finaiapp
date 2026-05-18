## Mục tiêu
Nâng tính thẩm mỹ tổng thể của Sidebar — không chỉ chữ mà cả nền, độ sâu, active state, hover effect, separator, scrollbar — để có cảm giác "premium" kiểu Linear / Vercel / Raycast.

## Nguyên tắc thiết kế
- Giữ tone xanh-đậm hiện tại (`--sidebar`) nhưng thêm chiều sâu bằng gradient overlay & soft glow.
- Phân vùng rõ bằng spacing + viền mờ thay vì viền cứng.
- Active state nhấn mạnh bằng: background tint + viền trái (đã có) + glow nhẹ + scale icon mượt.
- Mọi transition 200–300ms ease-out.

## Thay đổi đề xuất

### 1. Nền sidebar có chiều sâu (`src/styles.css`)
Thêm token mới:
- `--sidebar-bg-gradient: linear-gradient(180deg, oklch(0.20 0.04 260) 0%, oklch(0.16 0.035 265) 60%, oklch(0.18 0.04 270) 100%)`
- `--sidebar-glow: radial-gradient(600px circle at 0% 0%, oklch(0.45 0.18 270 / 0.18), transparent 50%)`
- `--shadow-sidebar-active: inset 2px 0 0 var(--sidebar-primary), 0 0 20px -8px oklch(0.72 0.16 162 / 0.4)`

### 2. Sidebar container (`app-sidebar.tsx`)
- `<Sidebar>`: thêm `style={{ background: "var(--sidebar-bg-gradient)" }}` và overlay `::before` glow ở góc trên (qua wrapper div absolute).
- Đường viền phải: từ `border-r-0` giữ nguyên, nhưng thêm `shadow-[1px_0_0_0_var(--sidebar-border)]` để có viền "soft".

### 3. Brand header
- Thêm subtle bottom gradient line thay cho `border-b` cứng: `border-b border-sidebar-border/40` + `bg-gradient-to-b from-transparent to-sidebar-accent/10`.
- Logo "A": thêm `ring-1 ring-sidebar-primary/30` và hover `rotate-3 scale-105` mượt.

### 4. AI Launcher pill
- Thêm `shadow-[0_0_24px_-8px_oklch(0.72_0.16_162/0.5)]` khi hover.
- Sparkles icon: thêm `animate-pulse` rất nhẹ (2.5s).
- Quick-AI chips: hover `translate-y-[-1px]` + `shadow-sm`.

### 5. Section label
- Thêm small dot trang trí: `<span class="inline-block h-1 w-1 rounded-full bg-sidebar-primary/40 mr-1.5"/>` trước label, tạo dấu hiệu phân vùng tinh tế.

### 6. Leaf / Group items
- Hover: `bg-sidebar-accent/40` + `translate-x-[1px]` (rất nhẹ, giống Linear).
- Active leaf: 
  - Background: `bg-sidebar-accent/60`
  - Viền trái: hiện đang `w-[2px] h-5` → đổi thành `w-[3px] h-6 rounded-r-full bg-gradient-to-b from-sidebar-primary to-sidebar-primary/60` + `shadow-[0_0_8px_var(--sidebar-primary)]`.
  - Icon: `text-sidebar-primary drop-shadow-[0_0_6px_oklch(0.72_0.16_162/0.5)]`.
- Group trigger (collapsible): chevron đổi màu khi mở (`text-sidebar-primary`).
- Sub-leaf indent line: hiện dùng default — đổi `border-l border-sidebar-border/30` mảnh hơn, cách lề trái 8px.

### 7. Footer (user card)
- Card nền: `bg-sidebar-accent/30 backdrop-blur-sm rounded-xl border border-sidebar-border/40 p-2` (thay vì button trần).
- Avatar: thêm `ring-2 ring-sidebar-primary/20` + gradient background `bg-gradient-to-br from-sidebar-primary/30 to-sidebar-accent`.
- Online dot: giữ `animate-pulse`, thêm glow `shadow-[0_0_6px_oklch(0.7_0.2_150)]`.

### 8. Divider giữa các section
- Thay vì để spacing trắng, thêm separator mảnh: giữa các `SidebarGroup` thêm `<div class="mx-3 my-1 h-px bg-gradient-to-r from-transparent via-sidebar-border/40 to-transparent"/>` (chỉ render khi section có label).

### 9. Custom scrollbar (sidebar content)
Thêm vào `styles.css`:
```css
[data-sidebar="content"]::-webkit-scrollbar { width: 4px; }
[data-sidebar="content"]::-webkit-scrollbar-thumb {
  background: oklch(1 0 0 / 0.08); border-radius: 2px;
}
[data-sidebar="content"]::-webkit-scrollbar-thumb:hover {
  background: oklch(1 0 0 / 0.16);
}
```

### 10. Collapsed state
- Khi collapsed (icon-only): icon button có hover effect `bg-sidebar-accent/50 rounded-lg` rõ rệt hơn.
- Active icon: thêm glow ring `ring-1 ring-sidebar-primary/40`.

## Phạm vi file
- `src/components/app-sidebar.tsx` — phần lớn class & wrapper.
- `src/styles.css` — token mới: gradient, glow, shadow, scrollbar.

## Kết quả mong đợi
Sidebar có **chiều sâu** (gradient + glow góc), **phân cấp tinh tế** (dot + separator mờ), **active state có sức nặng** (viền glow + drop-shadow icon), **hover mượt** (translate + shadow), **footer như card** thay vì nút trần — tổng thể đạt cảm giác "polished SaaS premium".

## Câu hỏi
Bạn muốn tone tổng thể nghiêng về:
1. **Linear/Vercel** — tối, neutral, accent xanh mint (giữ hiện tại + tinh chỉnh)
2. **Raycast/Arc** — tối, có chút gradient tím-xanh rõ hơn ở nền
3. **Notion/Apple** — sáng hơn, mềm mại, giảm contrast

Mặc định mình sẽ làm theo **option 1** (giữ style hiện tại, polish lên) nếu bạn không chỉ định.
