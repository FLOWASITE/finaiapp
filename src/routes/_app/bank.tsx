import { createFileRoute, Outlet, Link, useLocation } from "@tanstack/react-router";
import { Landmark, ListPlus, BookOpen, GitCompare, Building2 } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/bank")({
  component: BankLayout,
});

const TABS = [
  { to: "/bank", label: "Tổng quan", icon: Landmark, exact: true },
  { to: "/bank/accounts", label: "Danh mục TK ngân hàng", icon: Building2 },
  { to: "/bank/vouchers", label: "Phiếu thu/chi NH", icon: ListPlus },
  { to: "/bank/book", label: "Sổ phụ ngân hàng", icon: BookOpen },
  { to: "/bank/reconcile", label: "Đối chiếu sao kê", icon: GitCompare },
];

function BankLayout() {
  const loc = useLocation();
  return (
    <div>
      <div className="border-b bg-background sticky top-0 z-10">
        <nav className="flex gap-1 overflow-x-auto px-4">
          {TABS.map((t) => {
            const active = t.exact ? loc.pathname === t.to : loc.pathname === t.to || loc.pathname.startsWith(t.to + "/");
            const Icon = t.icon;
            return (
              <Link
                key={t.to}
                to={t.to}
                className={cn(
                  "group relative shrink-0 inline-flex items-center gap-2 px-3 py-3 text-sm font-medium transition-colors whitespace-nowrap",
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
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

      <div className="p-6 md:p-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Ngân hàng</h1>
          <p className="text-sm text-muted-foreground">
            Quản lý tài khoản ngân hàng, phiếu thu/chi qua NH, chuyển khoản nội bộ và đối chiếu sao kê
          </p>
        </div>

        <Outlet />
      </div>
    </div>
  );
}
