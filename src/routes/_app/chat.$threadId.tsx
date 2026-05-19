import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, AlertTriangle } from "lucide-react";
import { z } from "zod";
import { zodValidator } from "@tanstack/zod-adapter";
import { Composer } from "@/components/chat/composer";
import { MessageList, type ChatMsg } from "@/components/chat/message-list";
import { Button } from "@/components/ui/button";
import { getThread, appendMessage } from "@/lib/chat-threads.functions";
import { askAccountingStream } from "@/lib/chat.functions";
import { toast } from "sonner";

const searchSchema = z.object({ autostart: z.string().optional() });

export const Route = createFileRoute("/_app/chat/$threadId")({
  validateSearch: zodValidator(searchSchema),
  component: ThreadPage,
});

function ThreadPage() {
  const { threadId } = Route.useParams();
  const { autostart } = Route.useSearch();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const getFn = useServerFn(getThread);
  const appendFn = useServerFn(appendMessage);
  const askFn = useServerFn(askAccountingStream);

  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [localMsgs, setLocalMsgs] = useState<ChatMsg[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const startedRef = useRef<string | null>(null);

  const query = useQuery({
    queryKey: ["chat", "thread", threadId],
    queryFn: () => getFn({ data: { threadId } }),
    staleTime: 30_000,
  });

  // Reset local state when switching threads
  useEffect(() => {
    setLocalMsgs([]);
    setInput("");
    startedRef.current = null;
  }, [threadId]);

  const messages: ChatMsg[] =
    localMsgs.length > 0
      ? localMsgs
      : (query.data?.messages ?? []).map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
        }));

  // Auto-scroll
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, streaming]);

  const runAssistant = async (history: ChatMsg[]) => {
    setStreaming(true);
    const working = [...history, { role: "assistant" as const, content: "" }];
    setLocalMsgs(working);
    let buffer = "";
    try {
      const stream = await askFn({
        data: {
          question: history[history.length - 1]?.content ?? "",
          history: history.slice(0, -1).map((m) => ({
            role: m.role === "assistant" ? "assistant" : "user",
            content: m.content,
          })),
        },
      });
      for await (const chunk of stream as AsyncIterable<{ delta: string }>) {
        buffer += chunk.delta;
        setLocalMsgs((prev) => {
          const copy = [...prev];
          copy[copy.length - 1] = { role: "assistant", content: buffer };
          return copy;
        });
      }
      // Persist
      await appendFn({
        data: { threadId, role: "assistant", content: buffer },
      });
      qc.invalidateQueries({ queryKey: ["chat", "threads"] });
      qc.invalidateQueries({ queryKey: ["chat", "thread", threadId] });
    } catch (e: any) {
      const errText = `Lỗi: ${e?.message || "stream error"}`;
      setLocalMsgs((prev) => {
        const copy = [...prev];
        copy[copy.length - 1] = { role: "assistant", content: errText };
        return copy;
      });
      toast.error(errText);
    } finally {
      setStreaming(false);
    }
  };

  // Autostart: when thread was just created and we landed here with ?autostart=1
  useEffect(() => {
    if (!autostart || streaming || !query.data) return;
    if (startedRef.current === threadId) return;
    const msgs = query.data.messages;
    if (msgs.length === 1 && msgs[0].role === "user") {
      startedRef.current = threadId;
      const hist: ChatMsg[] = msgs.map((m) => ({ id: m.id, role: m.role, content: m.content }));
      runAssistant(hist);
      // strip the autostart flag so reload doesn't replay
      navigate({
        to: "/chat/$threadId",
        params: { threadId },
        search: {},
        replace: true,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autostart, query.data, threadId]);

  const send = async () => {
    const q = input.trim();
    if (!q || streaming) return;
    setInput("");
    const next: ChatMsg[] = [...messages, { role: "user", content: q }];
    setLocalMsgs(next);
    try {
      await appendFn({
        data: { threadId, role: "user", content: q, updateTitleIfBlank: true },
      });
    } catch (e: any) {
      toast.error(e?.message || "Không gửi được");
      return;
    }
    runAssistant(next);
  };

  if (query.isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Đang tải hội thoại…
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center">
          <AlertTriangle className="mx-auto mb-2 h-6 w-6 text-destructive" />
          <p className="mb-3 text-sm">{(query.error as any)?.message || "Không tải được hội thoại"}</p>
          <Button variant="outline" size="sm" onClick={() => query.refetch()}>
            Thử lại
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div ref={scrollRef} className="flex-1 overflow-auto">
        <MessageList messages={messages} streaming={streaming} />
      </div>
      <div className="border-t border-white/5 bg-background/50 px-4 py-3">
        <div className="mx-auto max-w-3xl">
          <Composer
            value={input}
            onChange={setInput}
            onSubmit={send}
            loading={streaming}
            autoFocus
          />
          <p className="mt-2 text-center text-[10px] text-muted-foreground/60">
            AI có thể đưa ra thông tin chưa chính xác — hãy kiểm tra lại số liệu quan trọng.
          </p>
        </div>
      </div>
    </div>
  );
}
