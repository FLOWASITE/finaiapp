import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { ThreadList } from "@/components/chat/thread-list";

export const Route = createFileRoute("/_app/chat")({
  component: ChatLayout,
});

function ChatLayout() {
  const navigate = useNavigate();
  return (
    <div className="flex h-[calc(100vh-7rem)] overflow-hidden">
      <ThreadList onNew={() => navigate({ to: "/chat" })} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Outlet />
      </div>
    </div>
  );
}

