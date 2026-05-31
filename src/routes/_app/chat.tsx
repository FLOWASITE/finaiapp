import { createFileRoute, Outlet, useNavigate, useLocation } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { ThreadList } from "@/components/chat/thread-list";
import { emitChatSidebarToggle } from "@/hooks/use-chat-sidebar-collapsed";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { ChatLayoutContext } from "@/components/chat/chat-layout-context";

export const Route = createFileRoute("/_app/chat")({
  component: ChatLayout,
});

const KEY = "chat:sidebar-collapsed";
const MOBILE_BREAKPOINT = 768;

function ChatLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState<boolean>(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Đọc trạng thái collapse từ localStorage sau khi mount để tránh hydration mismatch.
  useEffect(() => {
    const read = () => {
      try {
        setCollapsed(localStorage.getItem(KEY) === "1");
      } catch {}
    };
    read();
    window.addEventListener("storage", read);
    window.addEventListener("chat-sidebar-toggle", read);
    return () => {
      window.removeEventListener("storage", read);
      window.removeEventListener("chat-sidebar-toggle", read);
    };
  }, []);

  // Đóng Sheet mobile khi đổi route.
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const toggleDesktop = useCallback(() => {
    setCollapsed((v) => {
      const next = !v;
      try {
        localStorage.setItem(KEY, next ? "1" : "0");
      } catch {}
      return next;
    });
    emitChatSidebarToggle();
  }, []);

  // Click ☰ trong ChatHeader: dựa vào viewport tại thời điểm click → mở Sheet
  // (mobile) hoặc toggle collapse (desktop). Quyết định tại click time tránh
  // lệch render SSR/CSR.
  const onMenu = useCallback(() => {
    if (typeof window !== "undefined" && window.innerWidth < MOBILE_BREAKPOINT) {
      setMobileOpen((v) => !v);
    } else {
      toggleDesktop();
    }
  }, [toggleDesktop]);

  // Shortcut Cmd/Ctrl+\ trên desktop.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "\\") {
        if (typeof window !== "undefined" && window.innerWidth >= MOBILE_BREAKPOINT) {
          e.preventDefault();
          toggleDesktop();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleDesktop]);

  const newChat = () => navigate({ to: "/chat" });

  return (
    <ChatLayoutContext.Provider value={{ onMenu }}>
      <div className="chat-surface flex h-full overflow-hidden">
        {/* Desktop sidebar: ẩn dưới md, render CSS-based → không lệch hydration */}
        <div className="hidden md:flex">
          <ThreadList
            onNew={newChat}
            collapsed={collapsed}
            onToggle={toggleDesktop}
          />
        </div>

        {/* Mobile Sheet: luôn mount, chỉ mở khi user bấm ☰ */}
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent
            side="left"
            className="w-[88vw] max-w-sm border-r border-sidebar-border bg-sidebar p-0 text-sidebar-foreground [&>button]:hidden"
          >
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

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <Outlet />
        </div>
      </div>
    </ChatLayoutContext.Provider>
  );
}
