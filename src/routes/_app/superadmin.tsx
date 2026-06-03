import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ShieldAlert, Loader2 } from "lucide-react";
import { checkSuperadminNow, requireSuperadminGuard } from "@/lib/superadmin-guard";
import { useCurrentUser } from "@/hooks/use-current-user";

export const Route = createFileRoute("/_app/superadmin")({
  beforeLoad: requireSuperadminGuard,
  component: SuperadminLayout,
});

function SuperadminLayout() {
  const navigate = useNavigate();
  const { data: currentUser } = useCurrentUser();
  const [access, setAccess] = useState<"checking" | "allowed" | "denied" | "error">("checking");
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    let active = true;

    if (currentUser?.isSuperadmin) {
      setAccess("allowed");
      return () => {
        active = false;
      };
    }

    setAccess("checking");
    checkSuperadminNow().then((result) => {
      if (!active) return;
      if (result.status === "allowed") {
        setAccess("allowed");
        return;
      }
      if (result.status === "error") {
        setAccess("error");
        return;
      }
      setAccess("denied");
      setRedirecting(true);
      navigate({ to: result.status === "unauthenticated" ? "/login" : "/dashboard", replace: true });
    });

    return () => {
      active = false;
    };
  }, [currentUser?.isSuperadmin, navigate]);

  if (access !== "allowed") {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        {access === "error"
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
