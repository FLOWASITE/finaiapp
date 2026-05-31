import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ThreadList } from "@/components/chat/thread-list";
import { emitChatSidebarToggle } from "@/hooks/use-chat-sidebar-collapsed";

export const Route = createFileRoute("/_app/chat")({
  component: ChatLayout,
});

const KEY = "chat:sidebar-collapsed";

function ChatLayout() {
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState<boolean>(false);

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

  const toggle = () => {
    setCollapsed((v) => {
      const next = !v;
      try {
        localStorage.setItem(KEY, next ? "1" : "0");
      } catch {}
      emitChatSidebarToggle();
      return next;
    });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "\\") {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="chat-surface flex h-full overflow-hidden">
      <ThreadList
        onNew={() => navigate({ to: "/chat" })}
        collapsed={collapsed}
        onToggle={toggle}
      />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Outlet />
      </div>
    </div>
  );
}

