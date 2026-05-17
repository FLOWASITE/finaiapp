import { createFileRoute, Outlet, redirect, Link, useRouter } from "@tanstack/react-router";
import { LayoutDashboard, FileText, BookOpen, LogOut, BarChart3, Landmark, Boxes, MessageSquare, Package, Wallet, Users, Receipt, ShoppingCart } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_app")({
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
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
        <nav className="flex-1 space-y-4 overflow-y-auto p-3">
          <div className="space-y-1">
            <NavItem to="/dashboard" icon={<LayoutDashboard className="h-4 w-4" />}>Tổng quan</NavItem>
            <NavItem to="/chat" icon={<MessageSquare className="h-4 w-4" />}>Trợ lý AI</NavItem>
          </div>
          <NavGroup label="Mua – Bán">
            <NavItem to="/invoices" icon={<FileText className="h-4 w-4" />}>HĐ mua vào</NavItem>
            <NavItem to="/sales" icon={<ShoppingCart className="h-4 w-4" />}>HĐ bán ra</NavItem>
            <NavItem to="/receivables" icon={<Users className="h-4 w-4" />}>Công nợ</NavItem>
          </NavGroup>
          <NavGroup label="Kho – Quỹ">
            <NavItem to="/inventory" icon={<Package className="h-4 w-4" />}>Kho hàng</NavItem>
            <NavItem to="/cash" icon={<Wallet className="h-4 w-4" />}>Quỹ tiền mặt</NavItem>
            <NavItem to="/bank" icon={<Landmark className="h-4 w-4" />}>Đối soát NH</NavItem>
            <NavItem to="/assets" icon={<Boxes className="h-4 w-4" />}>TSCĐ</NavItem>
          </NavGroup>
          <NavGroup label="Sổ sách – Thuế">
            <NavItem to="/journal" icon={<BookOpen className="h-4 w-4" />}>Sổ nhật ký</NavItem>
            <NavItem to="/reports" icon={<BarChart3 className="h-4 w-4" />}>Báo cáo TC</NavItem>
            <NavItem to="/tax" icon={<Receipt className="h-4 w-4" />}>Tờ khai GTGT</NavItem>
          </NavGroup>
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

function NavGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">{label}</div>
      <div className="space-y-1">{children}</div>
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
