## Goal
Polish the "Tạo mặt hàng / dịch vụ mới" dialog to match the user's selected **Polished emerald dark** direction.

## Scope
Only `src/components/catalog/ItemCreateDialog.tsx` — no DB/schema changes, no business logic changes.

## Changes
1. **Dialog shell**: dark `bg-[#0F1219]` with `border-white/10`, `rounded-xl`, tighter padding.
2. **Header**: title + subtitle in white/slate-400, no extra chrome.
3. **Section dividers**: horizontal `bg-white/5` lines with centered emerald `text-[#10B981]` label.
4. **Dịch vụ / Hàng hóa toggle**: two buttons inside a `bg-[#161B22]` bordered container; active pill gets `bg-[#0F6E56]`.
5. **Account preset chips**: replace the old Select dropdown with clickable rounded pill chips; active chip gets emerald tint.
6. **All inputs**: `bg-[#161B22] border-white/10` with emerald focus ring.
7. **Checkboxes**: shadcn Checkbox with `data-[state=checked]:bg-[#0F6E56]` override.
8. **FCT section**: subtle `bg-white/[0.02] border-white/5` container, 3-column layout with bottom-border-only selects.
9. **Footer**: ghost cancel button + emerald submit with shadow.
10. **Cleanup**: remove unused `Separator` import; add `SectionTitle` helper component.

## Notes
- All existing form state, validation, and submit logic preserved exactly.
- Vietnamese labels stay verbatim.
- No functional changes to fields or flow.