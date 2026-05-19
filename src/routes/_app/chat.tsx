import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { ThreadList } from "@/components/chat/thread-list";

export const Route = createFileRoute("/_app/chat")({
  component: ChatLayout,
});

function ChatLayout() {
  const navigate = useNavigate();
  return (
    <div className="chat-surface flex h-[calc(100vh-7rem)] overflow-hidden rounded-2xl border border-border/40 bg-background/30 shadow-[0_8px_30px_-12px_rgba(0,0,0,0.15)] backdrop-blur-sm">
      <ThreadList onNew={() => navigate({ to: "/chat" })} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Outlet />
      </div>
    </div>
  );
}
