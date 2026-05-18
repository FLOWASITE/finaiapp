import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { SidebarProvider, SidebarTrigger, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { AppHeader } from "@/components/app-header";
import { CommandPalette } from "@/components/command-palette";
import { PageBreadcrumbs } from "@/components/page-breadcrumbs";
import { TenantSwitcher } from "@/components/tenant-switcher";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_app")({
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/login" });
  },
  component: AppLayout,
});

function AppLayout() {
  return (
    <SidebarProvider>
      <div className="flex h-screen w-full overflow-hidden bg-gradient-to-br from-background via-background to-secondary/30">
        <AppSidebar />
        <SidebarInset className="flex flex-1 flex-col overflow-hidden">
          <header className="shrink-0 px-3 pt-3 pb-2">
            <div className="flex h-14 items-center gap-3 rounded-2xl border border-white/5 bg-background/70 px-3 shadow-2xl shadow-emerald-500/5 backdrop-blur-xl supports-[backdrop-filter]:bg-background/50">
              <SidebarTrigger className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground" />
              <Separator orientation="vertical" className="h-6 bg-white/10" />
              <TenantSwitcher />
              <Separator orientation="vertical" className="h-6 hidden md:block bg-white/10" />
              <AppHeader />
            </div>
          </header>
          <main className="flex-1 overflow-auto">
            <PageBreadcrumbs />
            <Outlet />
          </main>
          <CommandPalette />
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
