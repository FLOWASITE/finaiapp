import { createFileRoute, Outlet, redirect, Link, useRouter } from "@tanstack/react-router";
import { LayoutDashboard, FileText, BookOpen, LogOut, BarChart3, Landmark, Boxes, MessageSquare } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_app")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/login" });
  },
  component: AppLayout,
});

function AppLayout() {
  const router = useRouter();

  const signOut = async () => {
    await supabase.auth.signOut();
    router.navigate({ to: "/" });
  };

  return (
    <div className="flex min-h-screen bg-secondary/20">
      <aside className="flex w-60 flex-col border-r border-border bg-card">
        <div className="border-b border-border px-5 py-4">
          <Link to="/dashboard" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground font-bold">
              A
            </div>
            <span className="font-semibold tracking-tight">AccuVN</span>
          </Link>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          <NavItem to="/dashboard" icon={<LayoutDashboard className="h-4 w-4" />}>
            Tổng quan
          </NavItem>
          <NavItem to="/invoices" icon={<FileText className="h-4 w-4" />}>
            Hóa đơn
          </NavItem>
          <NavItem to="/journal" icon={<BookOpen className="h-4 w-4" />}>
            Sổ nhật ký
          </NavItem>
        </nav>
        <div className="border-t border-border p-3">
          <Button variant="ghost" className="w-full justify-start" onClick={signOut}>
            <LogOut className="mr-2 h-4 w-4" />
            Đăng xuất
          </Button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}

function NavItem({
  to,
  icon,
  children,
}: {
  to: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Link
      to={to}
      className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent/10 hover:text-foreground"
      activeProps={{ className: "bg-accent/10 text-foreground" }}
    >
      {icon}
      {children}
    </Link>
  );
}
