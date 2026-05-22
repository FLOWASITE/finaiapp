import { Link, useRouterState } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

const TABS: { to: string; label: string; exact?: boolean }[] = [
  { to: "/purchases", label: "Tổng quan", exact: true },
  { to: "/purchases/orders", label: "Đơn đặt hàng" },
  { to: "/purchases/vouchers", label: "Phiếu mua hàng" },
  { to: "/purchases/invoices", label: "Hoá đơn mua" },
  { to: "/purchases/returns", label: "Hàng mua trả lại" },
  { to: "/payables", label: "Công nợ phải trả" },
];

export function PurchaseTabs() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="border-b bg-background sticky top-0 z-10">
      <nav className="flex gap-1 overflow-x-auto px-4">
        {TABS.map((t) => {
          const active = t.exact ? pathname === t.to : pathname === t.to || pathname.startsWith(t.to + "/");
          return (
            <Link
              key={t.to}
              to={t.to}
              className={cn(
                "shrink-0 px-3 py-3 text-sm font-medium border-b-2 transition-colors -mb-px whitespace-nowrap",
                active
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted",
              )}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
