## Mục tiêu

Refactor `ItemCreateDialog` để dialog tự đổi màu theo theme của app (light + dark), thay vì hard-code `#0F1219` / `#161B22` như hiện tại. Giữ nguyên toàn bộ layout, section dividers, item-type toggle, account preset pills và FCT grid đã được polished ở bản dark — chỉ đổi cách áp màu.

## Thay đổi

**File**: `src/components/catalog/ItemCreateDialog.tsx`

Thay các literal Tailwind/HEX bằng semantic tokens của shadcn (đã có sẵn cho cả 2 theme):

| Hiện tại (hard-code) | Đổi thành (semantic) |
|---|---|
| `bg-[#0F1219]` (DialogContent) | `bg-card` |
| `border-white/10`, `border-white/5` | `border-border` |
| `text-white` (title) | `text-foreground` |
| `text-slate-200`, `text-slate-300`, `text-slate-400` | `text-foreground` / `text-muted-foreground` |
| `text-slate-600` (placeholder) | `placeholder:text-muted-foreground` |
| `bg-[#161B22]` (inputs, toggle container) | `bg-muted` (hoặc `bg-background` cho input) |
| `bg-white/5`, `bg-white/[0.02]` (pill, FCT panel) | `bg-muted/50` |
| `bg-[#0F6E56]` (active toggle, button) | `bg-primary text-primary-foreground` |
| `text-[#10B981]`, `bg-[#0F6E56]/20`, `border-[#0F6E56]/30` (section title + active pill) | `text-primary`, `bg-primary/10`, `border-primary/30` |
| `focus-visible:ring-[#0F6E56]` | `focus-visible:ring-ring` (mặc định đã là primary) |
| `text-red-400` (error) | `text-destructive` |

Cụ thể:
- `SectionTitle`: divider `bg-border`, text `text-primary`.
- `inputCls` / `triggerCls`: bỏ override màu, để shadcn `Input`/`SelectTrigger` mặc định (đã theme-aware); chỉ giữ `focus-visible:ring-2 focus-visible:ring-ring`.
- `labelCls`: `text-sm font-medium text-foreground block mb-2`.
- Item-type toggle: container `bg-muted border-border`; nút active `bg-primary text-primary-foreground`, inactive `text-muted-foreground hover:text-foreground`.
- Account preset pills: active `bg-primary/10 border-primary/30 text-primary`, inactive `bg-muted border-border text-muted-foreground hover:bg-muted/80 hover:text-foreground`.
- FCT panel wrapper: `bg-muted/50 border border-border rounded-lg`.
- Footer button "Tạo mặt hàng": dùng `Button` mặc định (đã là primary), bỏ class `bg-[#0F6E56]`.
- Error text `err()`: đổi `text-red-400` → `text-destructive`.

## Không đổi

- Cấu trúc section, thứ tự field, logic preset TT99/TT133, validation Zod, server-fn `upsertCatalogItem`, callback `onCreated`.
- Layout grid 2 cột / 3 cột FCT, spacing `space-y-10`, `p-8`, `max-w-[880px]`.

## Kết quả mong đợi

- Light mode: dialog nền trắng (`bg-card`), text đen, viền xám nhạt, accent emerald (primary của project) cho section title / pill active / nút Tạo — đồng bộ với phần còn lại của app.
- Dark mode: hiển thị tương tự bản hard-code hiện tại nhờ token `card` / `muted` / `primary` đã được định nghĩa cho dark trong `styles.css`.
