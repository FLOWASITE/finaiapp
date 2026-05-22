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
      <div className="border-b border-border bg-card/40">
        <div className="flex gap-1 px-8 pt-4 overflow-x-auto">
          {TABS.map((t) => {
            const active = t.exact ? path === t.to : path.startsWith(t.to);
            return (
              <Link
                key={t.to}
                to={t.to as any}
                className={cn(
                  "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap",
                  active ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground",
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
