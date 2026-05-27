## Plan: Full-width Catalog Page

### Problem
`CatalogPage` is constrained by `mx-auto max-w-[1280px]`, leaving large empty margins on wide screens.

### Changes
1. **`src/components/catalog/CatalogPage.tsx`**
   - Remove `mx-auto max-w-[1280px]` from the inner wrapper so content spans the full viewport width.
   - Keep comfortable padding (`px-6 py-4` or `p-6`) so text doesn't touch screen edges.
   - Change hardcoded `bg-[#F8F7F4]` to `bg-background` to respect the design system.

2. **Spot-check child components**
   - Verify `CatalogHeader`, `ItemList`, `CategorySidebar` do not have their own inner max-width that would re-create the narrow column effect.

### Expected result
The "Hàng hóa & Dịch vụ" page uses the entire available width inside the `_app` layout, matching other full-width admin pages.