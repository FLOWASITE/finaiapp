import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/inventory")({ component: InventoryLayout });

const TABS: { to: string; label: string; exact?: boolean }[] = [
  { to: "/inventory", label: "Hàng tồn kho", exact: true },
  { to: "/inventory/unposted", label: "Phiếu chưa nhập/xuất kho" },
  { to: "/inventory/vouchers", label: "Phiếu nhập/xuất kho" },
  { to: "/inventory/transfers", label: "Chuyển kho" },
  { to: "/inventory/warehouses", label: "Kho hàng" },
  { to: "/inventory/stock-takes", label: "Kiểm kho" },
];

function InventoryLayout() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  return (
    <div>
      <div className="px-8 pt-5 pb-3">
        <div className="inline-flex items-center gap-1 rounded-2xl border border-white/5 bg-background/60 p-1 shadow-lg shadow-emerald-500/5 backdrop-blur-xl supports-[backdrop-filter]:bg-background/40 overflow-x-auto max-w-full">
          {TABS.map((t) => {
            const active = t.exact ? path === t.to : path.startsWith(t.to);
            return (
              <Link
                key={t.to}
                to={t.to as any}
                className={cn(
                  "relative px-4 py-1.5 text-sm font-medium rounded-xl transition-all duration-200 whitespace-nowrap",
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
