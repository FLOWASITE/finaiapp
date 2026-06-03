import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ShieldAlert, Loader2, AlertTriangle, RefreshCw } from "lucide-react";
import {
  checkSuperadminNow,
  requireSuperadminGuard,
  type SuperadminCheckResult,
} from "@/lib/superadmin-guard";
import { useCurrentUser } from "@/hooks/use-current-user";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_app/superadmin")({
  beforeLoad: requireSuperadminGuard,
  component: SuperadminLayout,
});

function SuperadminLayout() {
  const navigate = useNavigate();
  const { data: currentUser } = useCurrentUser();
  const [result, setResult] = useState<SuperadminCheckResult | { status: "checking" }>({
    status: "checking",
  });

  const runCheck = () => {
    setResult({ status: "checking" });
    checkSuperadminNow().then((r) => {
      setResult(r);
      if (r.status === "unauthenticated") {
        navigate({ to: "/login", replace: true });
      }
    });
  };

  useEffect(() => {
    if (currentUser?.isSuperadmin) {
      setResult({ status: "allowed" });
      return;
    }
    runCheck();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.isSuperadmin]);

  if (result.status === "allowed") {
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

  if (result.status === "checking") {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Đang xác thực quyền Super Admin…
      </div>
    );
  }

  if (result.status === "unauthenticated") {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-sm text-muted-foreground">
        Chưa đăng nhập. Đang chuyển sang trang đăng nhập…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl p-4 md:p-6 space-y-4">
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>
          {result.status === "forbidden"
            ? "Tài khoản không có quyền Super Admin"
            : `Không xác thực được quyền Super Admin (${result.code})`}
        </AlertTitle>
        <AlertDescription className="space-y-2 mt-2">
          {result.status === "forbidden" ? (
            <>
              <div>
                <span className="font-medium">Email:</span> {result.email ?? "(không rõ)"}
              </div>
              <div>
                <span className="font-medium">Roles hiện có:</span>{" "}
                {result.roles.length ? result.roles.join(", ") : "(rỗng)"}
              </div>
              <div className="text-xs opacity-80">{result.reason}</div>
            </>
          ) : (
            <>
              <div>
                <span className="font-medium">Bước thất bại:</span> {result.step}
              </div>
              <div className="text-xs opacity-80">{result.message}</div>
            </>
          )}
          <div className="flex gap-2 pt-2">
            <Button size="sm" variant="outline" onClick={runCheck}>
              <RefreshCw className="mr-2 h-3.5 w-3.5" /> Thử lại
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => navigate({ to: "/dashboard", replace: true })}
            >
              Về Dashboard
            </Button>
          </div>
        </AlertDescription>
      </Alert>
    </div>
  );
}
