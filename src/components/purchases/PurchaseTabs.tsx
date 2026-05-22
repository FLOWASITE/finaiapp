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
                "group relative shrink-0 px-3 py-3 text-sm font-medium transition-colors whitespace-nowrap",
                active ? "text-primary" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
              <span
                aria-hidden
                className={cn(
                  "pointer-events-none absolute left-2 right-2 -bottom-px h-[3px] rounded-full transition-all duration-300 ease-out",
                  active
                    ? "opacity-100 scale-x-100 bg-gradient-to-r from-primary/70 via-primary to-primary/70 shadow-[0_0_10px_hsl(var(--primary)/0.45)]"
                    : "opacity-0 scale-x-50 bg-muted-foreground/40 group-hover:opacity-60 group-hover:scale-x-90",
                )}
              />
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

