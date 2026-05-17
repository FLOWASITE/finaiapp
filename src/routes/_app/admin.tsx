import { createFileRoute, Outlet, redirect, Link, useRouterState } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Shield, Users, FileSearch, Lock, BarChart3, Download } from "lucide-react";

export const Route = createFileRoute("/_app/admin")({
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const { data: sess } = await supabase.auth.getSession();
    if (!sess.session) throw redirect({ to: "/login" });
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", sess.session.user.id);
    const allowed = (roles ?? []).some((r) => r.role === "owner" || r.role === "superadmin");
    if (!allowed) throw redirect({ to: "/dashboard" });
  },
  component: AdminLayout,
});

const TABS = [
  { to: "/admin", label: "Tổng quan", icon: BarChart3, exact: true },
  { to: "/admin/members", label: "Thành viên", icon: Users },
  { to: "/admin/audit", label: "Nhật ký", icon: FileSearch },
  { to: "/admin/periods", label: "Khóa kỳ", icon: Lock },
  { to: "/admin/backup", label: "Sao lưu", icon: Download },
];

function AdminLayout() {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  return (
    <div className="mx-auto max-w-7xl p-4 md:p-6 space-y-4">
      <div className="flex items-center gap-3">
        <div className="rounded-lg bg-primary/10 p-2 text-primary">
          <Shield className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Quản trị hệ thống</h1>
          <p className="text-xs text-muted-foreground">Phân quyền, nhật ký, khóa kỳ và sao lưu dữ liệu</p>
        </div>
      </div>

      <nav className="flex flex-wrap gap-1 border-b border-border">
        {TABS.map((t) => {
          const active = t.exact ? pathname === t.to : pathname === t.to || pathname.startsWith(t.to + "/");
          const Icon = t.icon;
          return (
            <Link
              key={t.to}
              to={t.to}
              className={`flex items-center gap-1.5 rounded-t-md px-3 py-2 text-sm transition-colors ${
                active
                  ? "border-b-2 border-primary text-foreground"
                  : "text-muted-foreground hover:text-foreground"
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
