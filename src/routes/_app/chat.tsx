import { createFileRoute, Outlet, useNavigate, useLocation } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { ThreadList } from "@/components/chat/thread-list";
import { emitChatSidebarToggle } from "@/hooks/use-chat-sidebar-collapsed";
import { ChatLayoutContext } from "@/components/chat/chat-layout-context";

export const Route = createFileRoute("/_app/chat")({
  component: ChatLayout,
});

const KEY = "chat:sidebar-collapsed";
const MOBILE_BREAKPOINT = 1024;

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
        {/* Desktop sidebar: chỉ hiện trên màn hình rộng; tablet/mobile dùng overlay để không chồng lớp. */}
        <div className="hidden lg:flex">
          <ThreadList
            onNew={newChat}
            collapsed={collapsed}
            onToggle={toggleDesktop}
          />
        </div>

        {mobileOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <button
              type="button"
              aria-label="Đóng danh sách hội thoại"
              className="absolute inset-0 bg-background/90"
              onClick={() => setMobileOpen(false)}
            />
            <div className="absolute inset-y-0 left-0 w-[min(22rem,88vw)] overflow-hidden border-r border-sidebar-border bg-sidebar shadow-2xl shadow-background/70">
              <ThreadList
                onNew={() => {
                  setMobileOpen(false);
                  newChat();
                }}
                collapsed={false}
                onItemClick={() => setMobileOpen(false)}
                className="w-full max-w-none"
              />
            </div>
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <Outlet />
        </div>
      </div>
    </ChatLayoutContext.Provider>
  );
}
