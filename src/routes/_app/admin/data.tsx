import { createFileRoute, Outlet, Link, useRouterState, redirect } from "@tanstack/react-router";
import { Database, Download, Upload, ArrowRightLeft, History, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_app/admin/data")({
  beforeLoad: ({ location }) => {
    if (location.pathname === "/admin/data") throw redirect({ to: "/admin/data/export" });
  },
  component: DataLayout,
});

const SUBTABS = [
  { to: "/admin/data/export", label: "Xuất dữ liệu (Fin)", icon: Download },
  { to: "/admin/data/import", label: "Nhập dữ liệu (Fin)", icon: Upload },
  { to: "/admin/data/carry-forward", label: "Kết chuyển số dư", icon: ArrowRightLeft },
  { to: "/admin/data/reset", label: "Reset dữ liệu", icon: Trash2 },
  { to: "/admin/data/history", label: "Lịch sử", icon: History },
];


function DataLayout() {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Database className="h-4 w-4" />
        <span>Quản lý dữ liệu kế toán theo năm tài chính. Tệp xuất/nhập dùng định dạng Fin (.fin.json).</span>
      </div>
      <nav className="inline-flex items-center gap-1 rounded-xl border bg-background/60 p-1 overflow-x-auto max-w-full">
        {SUBTABS.map((t) => {
          const active = pathname === t.to || pathname.startsWith(t.to + "/");
          const Icon = t.icon;
          return (
            <Link
              key={t.to}
              to={t.to}
              className={`inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg transition whitespace-nowrap ${
                active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
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
