## Mục tiêu
Làm chữ trên Sidebar (`src/components/app-sidebar.tsx`) thẩm mỹ, có phân cấp rõ ràng kiểu Linear/Notion — không đổi cấu trúc menu hay logic.

## Hệ thống typography mới (đồng bộ thang)

| Cấp | Size | Weight | Tracking | Màu |
|---|---|---|---|---|
| Brand "FinAI" | 15px | bold | tight | foreground |
| Brand sub "AI Accounting · v3" | 10px | medium | 0.14em uppercase | foreground/55 |
| Section label ("Vận hành"…) | 10.5px | semibold | 0.18em uppercase | foreground/50 |
| Group label (Bán hàng, Mua hàng…) | 13px | medium → semibold khi active | -0.005em | foreground |
| Leaf item | 13px | medium → semibold khi active | -0.005em | foreground |
| Sub leaf | 12.5px | regular → semibold khi active | -0.005em | foreground/75 |
| Footer email | 12.5px | semibold | tight | foreground |
| Footer status | 10.5px | medium | wide | foreground/55 |
| Badge | 10px | semibold | wide tabular-nums | — |
| AI pill text | 12.5px | medium | tight | — |
| Quick-AI chip | 10.5px | medium | wide | — |

## Thay đổi cụ thể (chỉ class)

1. **Brand header** (line ~266-269): `font-semibold` → `font-bold text-[15px] leading-snug`; sub-label `text-[10px] tracking-wider` → `text-[10px] font-medium tracking-[0.14em]`.
2. **SidebarGroupLabel** (line ~325): `text-[10px] tracking-wider` → `text-[10.5px] font-semibold uppercase tracking-[0.18em] mb-1`.
3. **LeafItem** (line ~466): thêm `text-[13px] font-medium tracking-[-0.005em] truncate`; khi `active` thêm `font-semibold`. Badge: `text-[10px] font-semibold tracking-wide tabular-nums`.
4. **GroupItem trigger label** (line ~525): `text-[13px] font-medium` + `font-semibold` khi có child active.
5. **Sub leaf** (line ~537-539): wrap span class `text-[12.5px] tracking-[-0.005em] text-sidebar-foreground/75 hover:text-sidebar-foreground`; active `font-semibold text-sidebar-primary`.
6. **AI launcher pill** (line ~296): "Hỏi FinAI AI…" → `text-[12.5px] font-medium tracking-tight`.
7. **Quick-AI chips** (line ~313): `text-[10px]` → `text-[10.5px] font-medium tracking-wide whitespace-nowrap`, padding `px-2.5 py-1`.
8. **Footer user info** (line ~378-381): email `text-[12.5px] font-semibold tracking-tight truncate`; status `text-[10.5px] font-medium tracking-wide text-sidebar-foreground/55`; avatar initial `font-bold`.
9. **"← Quay lại tổng quan"** (line 126): bỏ mũi tên `←` trong text (icon `ArrowLeft` đã đủ) → `"Quay lại tổng quan"`.

## Phạm vi
- 1 file: `src/components/app-sidebar.tsx`.
- Không đổi `src/styles.css`, không thêm font.
- Không đổi `SECTIONS`/`EINVOICE_SECTIONS` (trừ bỏ ký tự `←`), không đổi logic state/hook.

## Kết quả mong đợi
Sidebar có phân cấp thị giác rõ: section label (uppercase wide letter-spacing) → group (medium) → leaf (medium) → sub-leaf (nhỏ, mờ hơn). Active state nổi bật bằng cả màu + font weight thay vì chỉ màu icon.
