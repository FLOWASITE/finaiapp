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
import { PendingActions } from "@/components/ai/PendingActions";
import {
  getThread,
  appendMessage,
  deleteLastAssistantMessage,
} from "@/lib/chat-threads.functions";
import { askAccountingStream } from "@/lib/chat.functions";
import type { ToolEvent } from "@/components/chat/tool-calls";
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
  const deleteLastFn = useServerFn(deleteLastAssistantMessage);

  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [localMsgs, setLocalMsgs] = useState<ChatMsg[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const startedRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const query = useQuery({
    queryKey: ["chat", "thread", threadId],
    queryFn: () => getFn({ data: { threadId } }),
    staleTime: 30_000,
  });

  useEffect(() => {
    setLocalMsgs([]);
    setInput("");
    startedRef.current = null;
    abortRef.current?.abort();
    abortRef.current = null;
  }, [threadId]);

  const messages: ChatMsg[] =
    localMsgs.length > 0
      ? localMsgs
      : (query.data?.messages ?? []).map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          toolEvents: (m.metadata?.toolEvents as ToolEvent[] | undefined) ?? undefined,
        }));

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, streaming]);

  const runAssistant = async (history: ChatMsg[]) => {
    setStreaming(true);
    const controller = new AbortController();
    abortRef.current = controller;
    const working: ChatMsg[] = [
      ...history,
      { role: "assistant", content: "", toolEvents: [] },
    ];
    setLocalMsgs(working);
    let buffer = "";
    const toolEvents: ToolEvent[] = [];
    let sawProposeAction = false;

    const updateLast = (patch: Partial<ChatMsg>) => {
      setLocalMsgs((prev) => {
        const copy = [...prev];
        copy[copy.length - 1] = { ...copy[copy.length - 1], ...patch };
        return copy;
      });
    };

    try {
      const stream = await askFn({
        data: {
          question: history[history.length - 1]?.content ?? "",
          history: history.slice(0, -1).map((m) => ({
            role: m.role === "assistant" ? "assistant" : "user",
            content: m.content,
          })),
        },
        signal: controller.signal,
      } as any);

      for await (const ev of stream as AsyncIterable<any>) {
        if (controller.signal.aborted) break;
        if (ev.type === "text") {
          buffer += ev.delta;
          updateLast({ content: buffer });
        } else if (ev.type === "tool-call") {
          toolEvents.push(ev);
          if (ev.toolName === "proposeAction") sawProposeAction = true;
          updateLast({ toolEvents: [...toolEvents] });
        } else if (ev.type === "tool-result") {
          toolEvents.push(ev);
          updateLast({ toolEvents: [...toolEvents] });
        }
      }

      if (controller.signal.aborted) {
        buffer = buffer + "\n\n_Đã dừng._";
        updateLast({ content: buffer });
      }

      await appendFn({
        data: {
          threadId,
          role: "assistant",
          content: buffer,
          metadata: toolEvents.length ? { toolEvents } : undefined,
        },
      });
      qc.invalidateQueries({ queryKey: ["chat", "threads"] });
      qc.invalidateQueries({ queryKey: ["chat", "thread", threadId] });
      if (sawProposeAction) {
        qc.invalidateQueries({ queryKey: ["ai_actions_pending"] });
      }
    } catch (e: any) {
      if (controller.signal.aborted) return;
      const errText = `Lỗi: ${e?.message || "stream error"}`;
      updateLast({ content: errText });
      toast.error(errText);
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  };

  useEffect(() => {
    if (!autostart || streaming || !query.data) return;
    if (startedRef.current === threadId) return;
    const msgs = query.data.messages;
    if (msgs.length === 1 && msgs[0].role === "user") {
      startedRef.current = threadId;
      const hist: ChatMsg[] = msgs.map((m) => ({ id: m.id, role: m.role, content: m.content }));
      runAssistant(hist);
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

  const stop = () => {
    abortRef.current?.abort();
  };

  const regenerate = async () => {
    if (streaming) return;
    // remove last assistant from DB + state
    try {
      await deleteLastFn({ data: { threadId } });
    } catch (e: any) {
      toast.error(e?.message || "Không xoá được tin nhắn cuối");
      return;
    }
    const withoutLast: ChatMsg[] = [];
    for (let i = 0; i < messages.length; i++) {
      if (i === messages.length - 1 && messages[i].role === "assistant") continue;
      withoutLast.push(messages[i]);
    }
    setLocalMsgs(withoutLast);
    qc.invalidateQueries({ queryKey: ["chat", "thread", threadId] });
    runAssistant(withoutLast);
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
      <div ref={scrollRef} className="chat-scroll flex-1 overflow-auto">
        <MessageList
          messages={messages}
          streaming={streaming}
          onRegenerate={!streaming ? regenerate : undefined}
        />
      </div>
      <div className="relative px-4 pb-5 pt-4">
        <div className="pointer-events-none absolute inset-x-0 -top-8 h-8 chat-footer-fade" />
        <div className="mx-auto max-w-3xl">
          <div className="mb-3">
            <PendingActions />
          </div>
          <Composer
            value={input}
            onChange={setInput}
            onSubmit={send}
            onStop={stop}
            loading={streaming}
            autoFocus
          />
          <p className="mt-3 text-center text-[10px] text-muted-foreground/60">
            AI có thể đưa ra thông tin chưa chính xác — hãy kiểm tra lại số liệu quan trọng.
          </p>
        </div>
      </div>
    </div>
  );
}
