import { createFileRoute, Outlet, Link, useRouterState } from "@tanstack/react-router";
import { Briefcase, LayoutDashboard, Users, FileText, ListChecks, Contact } from "lucide-react";

export const Route = createFileRoute("/_app/office")({ component: OfficeLayout });

const TABS = [
  { to: "/office", label: "Tổng quan", icon: LayoutDashboard, exact: true },
  { to: "/office/clients", label: "Khách hàng", icon: Users },
  { to: "/office/contracts", label: "Hợp đồng", icon: FileText },
  { to: "/office/tasks", label: "Công việc", icon: ListChecks },
  { to: "/office/staff", label: "Nhân sự", icon: Contact },
];

function OfficeLayout() {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  return (
    <div className="mx-auto max-w-7xl p-4 md:p-6 space-y-4">
      <div className="flex items-center gap-3">
        <div className="rounded-lg bg-primary/10 p-2 text-primary">
          <Briefcase className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Văn phòng</h1>
          <p className="text-xs text-muted-foreground">
            Quản lý khách hàng dịch vụ, hợp đồng, công việc và nhân sự nội bộ
          </p>
        </div>
      </div>

      <nav className="inline-flex items-center gap-1 rounded-2xl border border-white/5 bg-background/60 p-1 shadow-lg backdrop-blur-xl supports-[backdrop-filter]:bg-background/40 overflow-x-auto max-w-full">
        {TABS.map((t) => {
          const active = t.exact ? pathname === t.to : pathname === t.to || pathname.startsWith(t.to + "/");
          const Icon = t.icon;
          return (
            <Link
              key={t.to}
              to={t.to}
              className={`inline-flex items-center gap-2 px-4 py-1.5 text-sm font-medium rounded-xl transition-all whitespace-nowrap ${
                active
                  ? "bg-gradient-to-br from-primary/90 to-primary text-primary-foreground shadow-md"
                  : "text-muted-foreground hover:text-foreground hover:bg-white/5"
              }`}
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
