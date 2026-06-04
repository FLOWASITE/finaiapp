import { createFileRoute, Outlet } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";

export const Route = createFileRoute("/_app/superadmin")({
  component: SuperadminLayout,
});

function SuperadminLayout() {
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
