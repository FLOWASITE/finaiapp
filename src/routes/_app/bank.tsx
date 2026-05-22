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
    <div className="p-6 md:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Ngân hàng</h1>
        <p className="text-sm text-muted-foreground">
          Quản lý tài khoản ngân hàng, phiếu thu/chi qua NH, chuyển khoản nội bộ và đối chiếu sao kê
        </p>
      </div>
      <nav className="inline-flex items-center gap-1 rounded-2xl border border-white/5 bg-background/60 p-1 shadow-lg shadow-emerald-500/5 backdrop-blur-xl supports-[backdrop-filter]:bg-background/40 overflow-x-auto max-w-full">
        {TABS.map((t) => {
          const active = t.exact ? loc.pathname === t.to : loc.pathname.startsWith(t.to);
          const Icon = t.icon;
          return (
            <Link
              key={t.to}
              to={t.to}
              className={cn(
                "inline-flex items-center gap-2 px-4 py-1.5 text-sm font-medium rounded-xl transition-all duration-200 whitespace-nowrap",
                active
                  ? "bg-gradient-to-br from-primary/90 to-primary text-primary-foreground shadow-md shadow-primary/30"
                  : "text-muted-foreground hover:text-foreground hover:bg-white/5"
              )}
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </Link>
          );
        })}
      </nav>

      <Outlet />
    </div>
  );
}
