import { createFileRoute, Outlet, redirect, Link, useRouterState } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Shield, Users, FileSearch, Lock, BarChart3, Database } from "lucide-react";

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
    { to: "/admin/data", label: "Quản lý dữ liệu", icon: Database },
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

      <nav className="inline-flex items-center gap-1 rounded-2xl border border-white/5 bg-background/60 p-1 shadow-lg shadow-emerald-500/5 backdrop-blur-xl supports-[backdrop-filter]:bg-background/40 overflow-x-auto max-w-full">
        {TABS.map((t) => {
          const active = t.exact ? pathname === t.to : pathname === t.to || pathname.startsWith(t.to + "/");
          const Icon = t.icon;
          return (
            <Link
              key={t.to}
              to={t.to}
              className={`inline-flex items-center gap-2 px-4 py-1.5 text-sm font-medium rounded-xl transition-all duration-200 whitespace-nowrap ${
                active
                  ? "bg-gradient-to-br from-primary/90 to-primary text-primary-foreground shadow-md shadow-primary/30"
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
