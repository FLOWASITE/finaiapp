## Mục tiêu

Chuyển sidebar lịch sử chat (`ThreadList`) từ theme tối sang **theme trắng (light)**, vẫn giữ tinh thần sleek/glassmorphic nhưng trên nền sáng. Chỉ chỉnh UI, không đụng logic.

## Phạm vi

- File duy nhất: `src/components/chat/thread-list.tsx`
- Không thay đổi tokens toàn cục trong `styles.css` (giữ light/dark theme app như cũ).

## Thay đổi chi tiết

### 1. Container
- `bg-[oklch(0.09_0.02_260)]` → `bg-white`
- `border-white/5` → `border-slate-200/70`

### 2. Header
- Title: `text-white` → `text-slate-900`
- Subtitle: `text-slate-500` (giữ, hợp nền trắng)
- Toggle button: `text-slate-400 hover:bg-white/5 hover:text-white` → `text-slate-500 hover:bg-slate-100 hover:text-slate-900`
- Nút "Cuộc trò chuyện mới": `border-white/10 bg-white/[0.03] text-slate-100 hover:bg-white/[0.06]` → `border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 hover:text-slate-900`
- Logo Sparkles giữ nguyên gradient AI.

### 3. Search input
- `border-white/[0.06] bg-white/[0.04] text-slate-200` → `border-slate-200 bg-slate-50 text-slate-800`
- Placeholder `text-slate-500` → `text-slate-400`
- Focus: `focus:bg-white/[0.08]` → `focus:bg-white focus:border-primary/40`
- Nút X: `hover:bg-white/10 hover:text-white` → `hover:bg-slate-100 hover:text-slate-700`

### 4. Filter "Chỉ hiện sao"
- Inactive: `text-slate-500 hover:text-slate-200` → `text-slate-500 hover:text-slate-800 hover:bg-slate-100`
- Active (amber pill): giữ nguyên (amber-500/10 vẫn đẹp trên trắng)

### 5. Bucket label
- `text-slate-500` giữ nguyên (vẫn hợp).

### 6. Thread item (KEY)
- Inactive: `text-slate-400 hover:bg-white/[0.04] hover:text-slate-100` → `text-slate-600 hover:bg-slate-100 hover:text-slate-900`
- Active: `bg-primary/10 border-primary/20 text-white` → `bg-primary/8 border-primary/20 text-slate-900` (text đậm)
- Accent bar bên trái: giữ `bg-primary`, glow nhẹ hơn
- Time stamp: `text-slate-500/80` → `text-slate-400`

### 7. Dropdown trigger (more)
- `text-slate-400 hover:bg-white/10 hover:text-white` → `text-slate-400 hover:bg-slate-200 hover:text-slate-700`

### 8. Empty state
- `text-slate-700` (icon) → `text-slate-300`
- `text-slate-500` (text) → `text-slate-500` giữ
- "Cuộc trò chuyện mới" highlight: `text-slate-300` → `text-slate-700`

### 9. Collapsed state
- `text-slate-400 hover:bg-white/5 hover:text-white` → `text-slate-500 hover:bg-slate-100 hover:text-slate-900`
- Nút new giữ primary tint.

### 10. Scrollbar
- Vẫn dùng `.chat-scroll` global (đã có).

## Acceptance

- Sidebar nền trắng, viền slate nhạt, contrast tốt.
- Active item có nền primary nhạt + accent bar primary bên trái.
- Hover mượt, tất cả chức năng (rename/pin/star/delete/search/filter/collapse) hoạt động nguyên vẹn.
- Không đụng logic, server functions, hay theme toàn cục.
