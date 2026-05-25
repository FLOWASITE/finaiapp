import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/items")({ component: ItemsLayout });

const TABS = [
  { to: "/items", label: "Khai báo mặt hàng", exact: true },
  { to: "/items/categories", label: "Nhóm hàng hoá" },
  { to: "/items/units", label: "Đơn vị tính" },
];

function ItemsLayout() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  return (
    <div>
      <div className="px-8 pt-5 pb-3">
        <div className="inline-flex items-center gap-1 rounded-2xl border border-white/5 bg-background/60 p-1 shadow-lg shadow-emerald-500/5 backdrop-blur-xl supports-[backdrop-filter]:bg-background/40">
          {TABS.map((t) => {
            const active = t.exact ? path === t.to : path.startsWith(t.to);
            return (
              <Link
                key={t.to}
                to={t.to}
                className={cn(
                  "relative px-4 py-1.5 text-sm font-medium rounded-xl transition-all duration-200",
                  active
                    ? "bg-gradient-to-br from-primary/90 to-primary text-primary-foreground shadow-md shadow-primary/30"
                    : "text-muted-foreground hover:text-foreground hover:bg-white/5",
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
