import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ShieldAlert, Loader2 } from "lucide-react";
import { requireSuperadminGuard } from "@/lib/superadmin-guard";
import { useCurrentUser } from "@/hooks/use-current-user";

export const Route = createFileRoute("/_app/superadmin")({
  beforeLoad: requireSuperadminGuard,
  component: SuperadminLayout,
});

function SuperadminLayout() {
  const navigate = useNavigate();
  const { data: currentUser, isLoading, isFetching, isError } = useCurrentUser();
  const [redirecting, setRedirecting] = useState(false);
  const hasSuperadminAccess = currentUser?.isSuperadmin === true;
  const isCheckingAccess = !currentUser && (isLoading || isFetching);

  useEffect(() => {
    if (hasSuperadminAccess || isCheckingAccess || redirecting || isError) return;

    if (!currentUser?.userId) {
      setRedirecting(true);
      navigate({ to: "/login", replace: true });
      return;
    }

    if (!currentUser.isSuperadmin) {
      setRedirecting(true);
      navigate({ to: "/dashboard", replace: true });
    }
  }, [currentUser, hasSuperadminAccess, isCheckingAccess, isError, navigate, redirecting]);

  if (!hasSuperadminAccess && (isCheckingAccess || isError || redirecting || !currentUser)) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        {isError
          ? "Chưa đọc được quyền Super Admin. Vui lòng tải lại trang."
          : "Đang xác thực quyền Super Admin…"}
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
      <Outlet />
    </div>
  );
}
