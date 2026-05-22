import { Link, useRouterState } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

const TABS = [
  { to: "/sales", label: "Tổng quan", exact: true },
  { to: "/sales/orders", label: "Đơn đặt hàng" },
  { to: "/sales/vouchers", label: "Phiếu bán hàng" },
  { to: "/invoices", label: "Hoá đơn bán" },
  { to: "/sales/returns", label: "Hàng bán bị trả lại" },
  { to: "/receivables", label: "Công nợ phải thu" },
] as const;

export function SalesTabs() {
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
