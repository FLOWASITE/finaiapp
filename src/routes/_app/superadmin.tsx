import { createFileRoute, Outlet, Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ShieldAlert, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { requireSuperadminGuard, checkSuperadminNow } from "@/lib/superadmin-guard";

export const Route = createFileRoute("/_app/superadmin")({
  beforeLoad: requireSuperadminGuard,
  component: SuperadminLayout,
});

const TABS = [
  { to: "/superadmin", label: "Tổng quan tenants", exact: true },
  { to: "/superadmin/accounts", label: "Tài khoản", exact: false },
  { to: "/superadmin/organizations", label: "Tổ chức", exact: false },
  { to: "/superadmin/ai-model", label: "AI Model", exact: false },
  { to: "/superadmin/audit", label: "Nhật ký", exact: false },
];


function SuperadminLayout() {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const navigate = useNavigate();
  // 'pending' = still verifying on client (prevents flash of protected UI).
  // 'allowed' / 'denied' = verified.
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

    // Re-verify whenever the auth session changes (sign-out, token refresh,
    // user switching). Catches role revocation mid-session.
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

  return (
    <div className="mx-auto max-w-7xl p-4 md:p-6 space-y-4">
      <div className="flex items-center gap-3">
        <div className="rounded-lg bg-destructive/10 p-2 text-destructive">
          <ShieldAlert className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Super Admin</h1>
          <p className="text-xs text-muted-foreground">Quản trị nền tảng — toàn bộ tenant</p>
        </div>
      </div>
      <nav className="flex flex-wrap gap-1 border-b border-border">
        {TABS.map((t) => {
          const active = t.exact ? pathname === t.to : pathname.startsWith(t.to);
          return (
            <Link
              key={t.to}
              to={t.to}
              className={`rounded-t-md px-3 py-2 text-sm transition-colors ${
                active ? "border-b-2 border-primary text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>
      <Outlet />
    </div>
  );
}
