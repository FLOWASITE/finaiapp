import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Sparkles } from "lucide-react";
import { ThreadList } from "@/components/chat/thread-list";
import { Composer } from "@/components/chat/composer";
import { createThread, appendMessage } from "@/lib/chat-threads.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/chat")({
  component: ChatLayout,
});

const SUGGESTIONS = [
  "Tháng này tổng chi phí là bao nhiêu?",
  "Liệt kê 5 nhà cung cấp chi nhiều nhất năm nay",
  "Còn bao nhiêu hóa đơn chưa duyệt?",
  "Công nợ phải trả (TK 331) hiện tại?",
];

function ChatLayout() {
  const navigate = useNavigate();
  const createFn = useServerFn(createThread);
  const appendFn = useServerFn(appendMessage);
  const qc = useQueryClient();

  const handleNew = () => navigate({ to: "/chat" });

  const handleStart = async (text: string) => {
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
        <Outlet />
        {/* Empty-state index: only rendered when no child route */}
        <EmptyOrChild onStart={handleStart} />
      </div>
    </div>
  );
}

/**
 * Renders the empty-state composer only when there's no active thread.
 * Detected by checking if the Outlet rendered any children — we rely on a
 * client-side route match instead. Simpler: when /chat exact, show empty.
 */
function EmptyOrChild({ onStart }: { onStart: (q: string) => void }) {
  const path = typeof window !== "undefined" ? window.location.pathname : "";
  // Show empty state only on exact /chat (no threadId)
  if (path !== "/chat" && path !== "/chat/") return null;
  return <ChatIndex onStart={onStart} />;
}

function ChatIndex({ onStart }: { onStart: (q: string) => void }) {
  const [input, setInput] = useState("");
  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-1 items-center justify-center px-4">
        <div className="mx-auto w-full max-w-2xl text-center">
          <div className="mb-4 flex justify-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Sparkles className="h-7 w-7" />
            </div>
          </div>
          <h1 className="mb-2 text-2xl font-semibold tracking-tight">Trợ lý kế toán AI</h1>
          <p className="mb-8 text-sm text-muted-foreground">
            Hỏi tự nhiên về dữ liệu kế toán của bạn — câu trả lời stream theo thời gian thực.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => onStart(s)}
                className="rounded-xl border border-white/10 bg-card/50 p-3 text-left text-sm transition hover:border-primary/40 hover:bg-card"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="border-t border-white/5 bg-background/50 px-4 py-3">
        <div className="mx-auto max-w-3xl">
          <Composer
            value={input}
            onChange={setInput}
            onSubmit={() => {
              const v = input.trim();
              if (!v) return;
              setInput("");
              onStart(v);
            }}
            autoFocus
            placeholder="Hỏi gì đó để bắt đầu cuộc trò chuyện…"
          />
        </div>
      </div>
    </div>
  );
}
