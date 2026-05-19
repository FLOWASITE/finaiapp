import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, AlertTriangle, ArrowLeft, ArrowDown } from "lucide-react";
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

const searchSchema = z.object({
  autostart: z.string().optional(),
  from: z.string().optional(),
});

export const Route = createFileRoute("/_app/chat/$threadId")({
  validateSearch: zodValidator(searchSchema),
  component: ThreadPage,
});

function ThreadPage() {
  const { threadId } = Route.useParams();
  const { autostart, from } = Route.useSearch();
  const navigate = useNavigate();
  const router = useRouter();
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
  const [atBottom, setAtBottom] = useState(true);
  const [hasNew, setHasNew] = useState(false);

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

  const restoredRef = useRef(false);
  const SCROLL_KEY = `__chatScroll:${threadId}`;

  // Save scroll position as user scrolls.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        try {
          localStorage.setItem(SCROLL_KEY, String(el.scrollTop));
        } catch {}
        const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
        const near = dist < 120;
        setAtBottom(near);
        if (near) setHasNew(false);
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("scroll", onScroll);
    };
  }, [SCROLL_KEY]);

  // Reset restore flag when switching threads.
  useEffect(() => {
    restoredRef.current = false;
  }, [threadId]);

  // Restore saved scroll on first render with data; otherwise auto-stick to bottom
  // when user is already near bottom.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (!restoredRef.current && messages.length > 0) {
      restoredRef.current = true;
      let saved: number | null = null;
      try {
        const raw = localStorage.getItem(SCROLL_KEY) ?? sessionStorage.getItem(SCROLL_KEY);
        if (raw != null) saved = Number(raw);
      } catch {}
      if (saved != null && Number.isFinite(saved)) {
        el.scrollTop = saved;
        return;
      }
      el.scrollTop = el.scrollHeight;
      return;
    }
    // Subsequent updates: keep position stable during streaming so growing
    // content doesn't push the view. Only auto-stick when not streaming and
    // the user is already near the bottom (e.g. after sending a new message).
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (streaming) {
      if (distanceFromBottom >= 120) setHasNew(true);
      return;
    }
    if (distanceFromBottom < 120) {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    } else {
      setHasNew(true);
    }
  }, [messages, streaming, SCROLL_KEY]);

  const runAssistant = async (history: ChatMsg[], attachments?: any[]) => {
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
          ...(attachments && attachments.length ? { attachments } : {}),
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
    if (!autostart || streaming) return;
    if (startedRef.current === threadId) return;
    // Use either freshly-loaded data or cache-primed data.
    const msgs = query.data?.messages ?? [];
    if (msgs.length === 1 && msgs[0].role === "user") {
      startedRef.current = threadId;
      const hist: ChatMsg[] = msgs.map((m) => ({ id: m.id, role: m.role, content: m.content }));
      let pendingAttachments: any[] | undefined;
      try {
        const raw = sessionStorage.getItem(`__attach:${threadId}`);
        if (raw) {
          pendingAttachments = JSON.parse(raw);
          sessionStorage.removeItem(`__attach:${threadId}`);
        }
      } catch {}
      runAssistant(hist, pendingAttachments);
      navigate({
        to: "/chat/$threadId",
        params: { threadId },
        search: from ? { from } : {},
        replace: true,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autostart, query.data, threadId]);

  const sendUserMessage = async (content: string, attachments?: any[]) => {
    const q = content.trim();
    if (!q || streaming) return;
    const next: ChatMsg[] = [...messages, { role: "user", content: q }];
    setLocalMsgs(next);
    const metaAttachments = attachments?.map((a) => ({
      name: a.name,
      mime: a.mime,
      size: a.size,
      kind: a.kind,
    }));
    try {
      await appendFn({
        data: {
          threadId,
          role: "user",
          content: q,
          updateTitleIfBlank: true,
          metadata: metaAttachments ? { attachments: metaAttachments } : undefined,
        },
      });
    } catch (e: any) {
      toast.error(e?.message || "Không gửi được");
      return;
    }
    // Only forward attachments with base64 to the LLM stream.
    const withBase64 = attachments?.filter((a) => typeof a.base64 === "string" && a.base64);
    runAssistant(next, withBase64 && withBase64.length ? withBase64 : undefined);
  };

  const send = async () => {
    const q = input.trim();
    if (!q || streaming) return;
    setInput("");
    await sendUserMessage(q);
  };

  const handleAttach = (payloads: any[]) => {
    if (!payloads.length || streaming) return;
    try {
      sessionStorage.setItem(`__attach:${threadId}`, JSON.stringify(payloads));
    } catch {}
    const summary = payloads.map((p) => `📎 ${p.name}`).join("\n");
    void sendUserMessage(
      `Xử lý ${payloads.length} chứng từ:\n${summary}`,
      payloads.map((p) => ({
        name: p.name,
        mime: p.mime,
        size: p.size,
        kind: p.kind,
      })),
    );
  };

  useEffect(() => {
    const onDockSend = (e: Event) => {
      const detail = (e as CustomEvent<{
        threadId: string;
        content: string;
        attachments?: any[];
      }>).detail;
      if (!detail || detail.threadId !== threadId) return;
      if (streaming) {
        toast.error("Đang xử lý câu hỏi trước, vui lòng đợi.");
        return;
      }
      // Prefer full payloads (with base64) stashed by the dock before dispatch.
      let fullAttachments: any[] | undefined;
      try {
        const raw = sessionStorage.getItem(`__attach:${threadId}`);
        if (raw) {
          fullAttachments = JSON.parse(raw);
          sessionStorage.removeItem(`__attach:${threadId}`);
        }
      } catch {}
      void sendUserMessage(detail.content, fullAttachments ?? detail.attachments);
    };
    window.addEventListener("chat:dock-send", onDockSend as EventListener);
    return () => window.removeEventListener("chat:dock-send", onDockSend as EventListener);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId, streaming, messages]);

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

  // Note: removed full-screen "Đang tải hội thoại…" spinner.
  // When user comes from ChatDock the cache is primed so query.data is available
  // immediately. On cold refresh, MessageList renders empty briefly while
  // getThread loads in the background — much less jarring than a blank screen.

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
      <div className="border-b border-border/40 bg-background/60 px-4 py-2 backdrop-blur-xl">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => {
              if (from) router.history.push(from);
              else if (window.history.length > 1) router.history.back();
              else navigate({ to: "/chat" });
            }}
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {from ? "Quay lại trang trước" : "Quay lại"}
          </Button>
        </div>
      </div>
      <div ref={scrollRef} className="chat-scroll flex-1 overflow-auto">
        <MessageList
          messages={messages}
          streaming={streaming}
          onRegenerate={!streaming ? regenerate : undefined}
        />
      </div>
      <div className="relative px-4 pb-5 pt-4">
        {!atBottom && (
          <div className="pointer-events-none absolute inset-x-0 -top-12 z-10 flex justify-center">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => {
                const el = scrollRef.current;
                if (!el) return;
                el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
                setHasNew(false);
              }}
              className="pointer-events-auto relative h-8 gap-1.5 rounded-full border border-border/60 bg-background/90 px-3 text-xs shadow-lg backdrop-blur-xl"
            >
              {hasNew && (
                <span className="absolute -right-1 -top-1 flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/60" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary" />
                </span>
              )}
              <ArrowDown className="h-3.5 w-3.5" />
              Đang xem tin cũ — về cuối
            </Button>
          </div>
        )}
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
            onAttach={handleAttach}
            onTranscript={(t) => {
              setInput("");
              void sendUserMessage(t);
            }}
          />
          <p className="mt-3 text-center text-[10px] text-muted-foreground/60">
            AI có thể đưa ra thông tin chưa chính xác — hãy kiểm tra lại số liệu quan trọng.
          </p>
        </div>
      </div>
    </div>
  );
}
