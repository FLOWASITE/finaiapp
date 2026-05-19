import { createFileRoute, Outlet, Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ShieldAlert,
  Loader2,
  LayoutDashboard,
  Users,
  Building2,
  Lock,
  CreditCard,
  Settings,
  Sparkles,
  ScrollText,
  DatabaseBackup,
  ListChecks,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { requireSuperadminGuard, checkSuperadminNow } from "@/lib/superadmin-guard";

export const Route = createFileRoute("/_app/superadmin")({
  beforeLoad: requireSuperadminGuard,
  component: SuperadminLayout,
});

type NavItem = { to: string; label: string; icon: typeof LayoutDashboard; exact?: boolean };
type NavGroup = { label: string; items: NavItem[] };

const NAV: NavGroup[] = [
  {
    label: "Tổng quan",
    items: [
      { to: "/superadmin", label: "Tổng quan tenants", icon: LayoutDashboard, exact: true },
      { to: "/superadmin/organizations", label: "Tổ chức", icon: Building2 },
      { to: "/superadmin/accounts", label: "Tài khoản", icon: Users },
    ],
  },
  {
    label: "Người dùng & bảo mật",
    items: [
      { to: "/superadmin/security", label: "Bảo mật", icon: Lock },
    ],
  },
  {
    label: "Nhật ký & sao lưu",
    items: [
      { to: "/superadmin/audit", label: "Nhật ký", icon: ScrollText },
      { to: "/superadmin/backups", label: "Sao lưu", icon: DatabaseBackup },
      { to: "/superadmin/jobs", label: "Tác vụ", icon: ListChecks },
    ],
  },
  {
    label: "Cài đặt & Billing",
    items: [
      { to: "/superadmin/billing", label: "Billing", icon: CreditCard },
      { to: "/superadmin/settings", label: "Cài đặt", icon: Settings },
      { to: "/superadmin/ai-model", label: "AI Model", icon: Sparkles },
    ],
  },
];

function SuperadminLayout() {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const navigate = useNavigate();
  const [state, setState] = useState<"pending" | "allowed" | "denied">("pending");

  useEffect(() => {
    let cancelled = false;
    const verify = async () => {
      const ok = await checkSuperadminNow();
      if (cancelled) return;
      if (!ok) {
        setState("denied");
        navigate({ to: "/dashboard", replace: true });
      } else {
        setState("allowed");
      }
    };
    verify();
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      verify();
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (state !== "allowed") {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        {state === "pending" ? "Đang xác thực quyền Super-admin…" : "Bạn không có quyền truy cập trang này."}
      </div>
    );
  }

  const isActive = (item: NavItem) =>
    item.exact ? pathname === item.to : pathname === item.to || pathname.startsWith(item.to + "/");

  return (
    <div className="flex min-h-[calc(100vh-5rem)] w-full">
      <aside className="hidden md:flex w-60 shrink-0 flex-col gap-4 border-r border-border/60 bg-muted/20 p-3">
        <div className="flex items-center gap-2 px-2 pt-1">
          <div className="rounded-lg bg-destructive/10 p-1.5 text-destructive">
            <ShieldAlert className="h-4 w-4" />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold">Super Admin</div>
            <div className="text-[10px] text-muted-foreground">Quản trị nền tảng</div>
          </div>
        </div>
        <nav className="flex flex-col gap-3">
          {NAV.map((group) => (
            <div key={group.label} className="flex flex-col gap-0.5">
              <div className="px-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/70">
                {group.label}
              </div>
              {group.items.map((item) => {
                const active = isActive(item);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors ${
                      active
                        ? "bg-primary/10 text-foreground font-medium"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground"
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
      </aside>

      <div className="flex-1 min-w-0 p-4 md:p-6">
        {/* Mobile nav */}
        <nav className="md:hidden mb-4 flex flex-wrap gap-1 border-b border-border pb-2">
          {NAV.flatMap((g) => g.items).map((item) => {
            const active = isActive(item);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`rounded-md px-2.5 py-1.5 text-xs transition-colors ${
                  active ? "bg-primary/10 text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <Outlet />
      </div>
    </div>
  );
}
