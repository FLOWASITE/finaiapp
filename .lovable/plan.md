## Vấn đề
Trong `src/components/app-sidebar.tsx` (dòng 241–242), `isActive` dùng:
```ts
pathname === to || pathname.startsWith(to + "/")
```
Khi vào `/assets/allocations`, cả `/assets` (Tài sản cố định) lẫn `/assets/allocations` (Tài sản phân bổ) đều thoả → cả hai cùng sáng.

## Fix
Đổi `isActive` thành "longest-prefix wins": một item active khi pathname khớp prefix của nó VÀ không có item nào khác trong sidebar có `to` dài hơn cũng khớp.

```ts
const allTos = React.useMemo(
  () => entries.flatMap((e) => (isGroup(e) ? e.items.map((i) => i.to) : [e.to])),
  []
);

const isActive = React.useCallback((to: string) => {
  const match = pathname === to || pathname.startsWith(to + "/");
  if (!match) return false;
  // bị "đè" bởi route con cụ thể hơn
  return !allTos.some(
    (other) => other !== to && other.startsWith(to + "/") &&
      (pathname === other || pathname.startsWith(other + "/"))
  );
}, [pathname, allTos]);
```

Áp dụng đồng thời cho `hasActiveChild` của group (đã dùng `isActive` nên tự kế thừa).

Không đụng tới logic khác, không sửa route.
