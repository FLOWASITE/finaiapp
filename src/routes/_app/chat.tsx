import { createFileRoute, Outlet, useNavigate, useLocation } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ThreadList } from "@/components/chat/thread-list";
import { emitChatSidebarToggle } from "@/hooks/use-chat-sidebar-collapsed";
import { useIsMobile } from "@/hooks/use-mobile";
import { Sheet, SheetContent } from "@/components/ui/sheet";

export const Route = createFileRoute("/_app/chat")({
  component: ChatLayout,
});

const KEY = "chat:sidebar-collapsed";

function ChatLayout() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState<boolean>(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const read = () => {
      try {
        setCollapsed(localStorage.getItem(KEY) === "1");
      } catch {}
    };
    read();
    window.addEventListener("chat-sidebar-toggle", read);
    window.addEventListener("storage", read);
    return () => {
      window.removeEventListener("chat-sidebar-toggle", read);
      window.removeEventListener("storage", read);
    };
  }, []);

  // Trên mobile: nút ☰ phát event "chat-sidebar-toggle" → mở Sheet.
  useEffect(() => {
    if (!isMobile) return;
    const open = () => setMobileOpen((v) => !v);
    window.addEventListener("chat-sidebar-toggle", open);
    return () => window.removeEventListener("chat-sidebar-toggle", open);
  }, [isMobile]);

  // Đóng Sheet khi đổi route.
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const toggleDesktop = () => {
    setCollapsed((v) => {
      const next = !v;
      try {
        localStorage.setItem(KEY, next ? "1" : "0");
      } catch {}
      return next;
    });
  };

  useEffect(() => {
    if (isMobile) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "\\") {
        e.preventDefault();
        toggleDesktop();
        emitChatSidebarToggle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isMobile]);

  const newChat = () => navigate({ to: "/chat" });

  return (
    <div className="chat-surface flex h-full overflow-hidden">
      {!isMobile && (
        <ThreadList
          onNew={newChat}
          collapsed={collapsed}
          onToggle={() => {
            toggleDesktop();
            emitChatSidebarToggle();
          }}
        />
      )}

      {isMobile && (
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent side="left" className="w-80 max-w-[85vw] p-0">
            <ThreadList
              onNew={() => {
                setMobileOpen(false);
                newChat();
              }}
              collapsed={false}
              onItemClick={() => setMobileOpen(false)}
            />
          </SheetContent>
        </Sheet>
      )}

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Outlet />
      </div>
    </div>
  );
}
