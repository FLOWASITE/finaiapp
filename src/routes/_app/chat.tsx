import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ThreadList } from "@/components/chat/thread-list";
import { createThread, appendMessage } from "@/lib/chat-threads.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/chat")({
  component: ChatLayout,
});

export type StartThreadFn = (text: string) => Promise<void>;

function ChatLayout() {
  const navigate = useNavigate();
  const createFn = useServerFn(createThread);
  const appendFn = useServerFn(appendMessage);
  const qc = useQueryClient();

  const handleNew = () => navigate({ to: "/chat" });

  const startThread: StartThreadFn = async (text: string) => {
    const q = text.trim();
    if (!q) return;
    try {
      const t = await createFn({ data: { title: q.slice(0, 60) } });
      await appendFn({
        data: { threadId: t.id, role: "user", content: q, updateTitleIfBlank: false },
      });
      qc.invalidateQueries({ queryKey: ["chat", "threads"] });
      navigate({
        to: "/chat/$threadId",
        params: { threadId: t.id },
        search: { autostart: "1" },
      });
    } catch (e: any) {
      toast.error(e?.message || "Không tạo được cuộc trò chuyện");
    }
  };

  return (
    <div className="flex h-[calc(100vh-7rem)] overflow-hidden">
      <ThreadList onNew={handleNew} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Outlet context={{ startThread }} />
      </div>
    </div>
  );
}
