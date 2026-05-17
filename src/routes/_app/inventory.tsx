import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/inventory")({ component: InventoryLayout });

const TABS = [
  { to: "/inventory", label: "Tồn kho", exact: true },
  { to: "/inventory/movements", label: "Thẻ kho / Phát sinh" },
  { to: "/inventory/stock-takes", label: "Kiểm kê" },
  { to: "/inventory/categories", label: "Danh mục" },
];

function InventoryLayout() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  return (
    <div>
      <div className="border-b border-border bg-card/40">
        <div className="flex gap-1 px-8 pt-4">
          {TABS.map((t) => {
            const active = t.exact ? path === t.to : path.startsWith(t.to);
            return (
              <Link
                key={t.to}
                to={t.to}
                className={cn(
                  "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
                  active
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {t.label}
              </Link>
            );
          })}
        </div>
      </div>
      <Outlet />
    </div>
  );
}
