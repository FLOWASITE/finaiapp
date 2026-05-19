import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ThreadList } from "@/components/chat/thread-list";

export const Route = createFileRoute("/_app/chat")({
  component: ChatLayout,
});

const KEY = "chat:sidebar-collapsed";

function ChatLayout() {
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(KEY) === "1";
  });

  const toggle = () => {
    setCollapsed((v) => {
      const next = !v;
      try {
        localStorage.setItem(KEY, next ? "1" : "0");
      } catch {}
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
    <div className="chat-surface flex h-[calc(100vh-7rem)] overflow-hidden rounded-2xl border border-border/40 bg-background/30 shadow-[0_8px_30px_-12px_rgba(0,0,0,0.15)] backdrop-blur-sm">
      <ThreadList
        onNew={() => navigate({ to: "/chat" })}
        collapsed={collapsed}
        onToggle={toggle}
      />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Outlet />
      </div>
    </div>
  );
}
