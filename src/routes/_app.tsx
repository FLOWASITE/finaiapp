import { createFileRoute, Outlet, redirect, useLocation } from "@tanstack/react-router";
import { SidebarProvider, SidebarTrigger, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { AppHeader } from "@/components/app-header";
import { CommandPalette } from "@/components/command-palette";

import { TenantSwitcher } from "@/components/tenant-switcher";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { clearSupabaseAuthStorage, withTimeoutReject } from "@/lib/auth-recovery";
import { ChatDock } from "@/components/chat/chat-dock";
import { useWorkspace } from "@/hooks/use-workspace";
import { useChatSidebarCollapsed } from "@/hooks/use-chat-sidebar-collapsed";
import { useInboxDockHidden } from "@/hooks/use-inbox-dock-hidden";
import { UploadQueueProvider } from "@/lib/upload-queue";
import { UploadDock } from "@/components/upload-dock";

export const Route = createFileRoute("/_app")({
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    try {
      const { data, error } = await withTimeoutReject(supabase.auth.getSession(), 8_000);
      if (error || !data.session?.access_token) {
        clearSupabaseAuthStorage();
        throw redirect({ to: "/login" });
      }
    } catch (error) {
      if (error != null && typeof error === "object" && "isRedirect" in error) throw error;
      throw redirect({ to: "/login" });
    }
  },
  component: AppLayout,
});

function AppLayout() {
  const { workspace } = useWorkspace();
  const location = useLocation();
  const onChatRoute = location.pathname.startsWith("/chat");
  const chatHistoryCollapsed = useChatSidebarCollapsed();
  const onSuperAdminRoute = location.pathname.startsWith("/superadmin");
  const chromeless = location.pathname === "/inbox";
  const showDock = workspace === "front" && !onChatRoute && !onSuperAdminRoute && !chromeless;
  const hideHeader = onChatRoute;

  const { hidden: inboxDockHidden } = useInboxDockHidden();

  if (chromeless) {
    return (
      <UploadQueueProvider>
        <div className="h-screen w-full overflow-hidden bg-background">
          <Outlet />
          {workspace === "front" && !inboxDockHidden ? <ChatDock /> : null}
          <UploadDock />
          <CommandPalette />
        </div>
      </UploadQueueProvider>
    );
  }

  return (
    <UploadQueueProvider>
      <SidebarProvider>
        <div className="flex h-screen w-full overflow-hidden bg-gradient-to-br from-background via-background to-secondary/30">
          <AppSidebar />
          <SidebarInset className="flex flex-1 flex-col overflow-hidden">
            {!hideHeader && (
              <header className="shrink-0 px-3 pt-3 pb-2">
                <div className="flex h-14 items-center gap-3 rounded-2xl border border-white/5 bg-background/70 px-3 shadow-2xl shadow-emerald-500/5 backdrop-blur-xl supports-[backdrop-filter]:bg-background/50">
                  <SidebarTrigger className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground" />
                  <Separator orientation="vertical" className="h-6 bg-white/10" />
                  <TenantSwitcher />
                  <Separator orientation="vertical" className="h-6 hidden md:block bg-white/10" />
                  <AppHeader />
                </div>
              </header>
            )}
            <main
              className={`flex-1 ${onChatRoute ? "overflow-hidden" : "overflow-auto"} ${showDock ? "pb-4" : ""}`}
            >
              <Outlet />
            </main>
            {showDock ? <ChatDock /> : null}
            <UploadDock />
            <CommandPalette />
          </SidebarInset>
        </div>
      </SidebarProvider>
    </UploadQueueProvider>
  );
}

