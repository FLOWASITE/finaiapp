import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { SidebarProvider, SidebarTrigger, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { AppHeader } from "@/components/app-header";
import { TenantSwitcher } from "@/components/tenant-switcher";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { getActiveTenant, listMyTenants } from "@/lib/tenants.functions";

export const Route = createFileRoute("/_app")({
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/login" });
  },
  loader: ({ context: { queryClient } }) => {
    // Fire-and-forget prefetch so that opening Settings (or any tenant-aware
    // screen) finds the data already in cache. Do NOT await — keeps navigation
    // instant; the queries resolve in background.
    queryClient.prefetchQuery({
      queryKey: ["active-tenant"],
      queryFn: () => getActiveTenant(),
      staleTime: 60_000,
    });
    queryClient.prefetchQuery({
      queryKey: ["my-tenants"],
      queryFn: () => listMyTenants(),
      staleTime: 60_000,
    });
  },
  component: AppLayout,
});

function AppLayout() {
  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-gradient-to-br from-background via-background to-secondary/30">
        <AppSidebar />
        <SidebarInset className="flex-1 overflow-hidden">
          <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border/60 bg-background/70 px-4 backdrop-blur-xl supports-[backdrop-filter]:bg-background/50">
            <SidebarTrigger className="h-8 w-8" />
            <Separator orientation="vertical" className="h-5" />
            <TenantSwitcher />
            <Separator orientation="vertical" className="h-5 hidden md:block" />
            <AppHeader />
          </header>
          <main className="overflow-auto">
            <Outlet />
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
