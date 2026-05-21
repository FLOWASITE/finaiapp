import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, ArrowDown } from "lucide-react";
import { SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { z } from "zod";
import { zodValidator } from "@tanstack/zod-adapter";
import { Composer } from "@/components/chat/composer";
import { MessageList, type ChatMsg } from "@/components/chat/message-list";
import { ChatSkeleton } from "@/components/chat/chat-skeleton";
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
  optimistic: z.string().optional(),
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
  const { setOpen: setAppSidebarOpen } = useSidebar();

  // Khi vào thread từ ChatDock (có autostart) trên Desktop: đóng AppSidebar
  // (Mode AI) + mở History sidebar. Chỉ chạy 1 lần khi mount.
  useEffect(() => {
    if (!autostart) return;
    if (typeof window === "undefined") return;
    const isDesktop = window.matchMedia("(min-width: 768px)").matches;
    if (!isDesktop) return;
    setAppSidebarOpen(false);
    try {
      localStorage.setItem("chat:sidebar-collapsed", "0");
    } catch {}
    window.dispatchEvent(new Event("chat-sidebar-toggle"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [localMsgs, setLocalMsgs] = useState<ChatMsg[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const startedRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  // Đánh dấu lần abort kế tiếp là do user nhấn Stop (giữ partial + marker)
  // hay do replacement (huỷ và bỏ partial).
  const userStoppedRef = useRef(false);
  const [atBottom, setAtBottom] = useState(true);
  const [hasNew, setHasNew] = useState(false);

  // Khi đang ở optimistic thread (id `temp-...`), ta chưa có bản ghi DB nên
  // bỏ qua getThread; localMsgs/cache đã được ChatDock prime sẵn.
  const isOptimistic = threadId.startsWith("temp-");

  // Lưu id thật khi ChatDock resolve xong. Dùng cho appendFn để persist đúng id.
  const realThreadIdRef = useRef<string | null>(isOptimistic ? null : threadId);
  const realThreadIdResolveRef = useRef<((id: string) => void) | null>(null);
  const realThreadIdPromiseRef = useRef<Promise<string> | null>(null);
  // Bỏ qua reset effect khi navigate replace từ temp -> real id.
  const skipResetRef = useRef(false);

  const query = useQuery({
    queryKey: ["chat", "thread", threadId],
    queryFn: () => getFn({ data: { threadId } }),
    staleTime: 30_000,
    enabled: !isOptimistic,
  });

  useEffect(() => {
    if (skipResetRef.current) {
      skipResetRef.current = false;
      return;
    }
    setLocalMsgs([]);
    setInput("");
    startedRef.current = null;
    userStoppedRef.current = false;
    abortRef.current?.abort();
    abortRef.current = null;
    realThreadIdRef.current = threadId.startsWith("temp-") ? null : threadId;
    if (threadId.startsWith("temp-")) {
      realThreadIdPromiseRef.current = new Promise<string>((res) => {
        realThreadIdResolveRef.current = res;
      });
    } else {
      realThreadIdPromiseRef.current = null;
      realThreadIdResolveRef.current = null;
    }
  }, [threadId]);

  // Lắng nghe ChatDock báo đã tạo thread thật → swap id.
  useEffect(() => {
    if (!isOptimistic) return;
    const onResolved = (e: Event) => {
      const detail = (e as CustomEvent<{
        tempId: string;
        realThreadId: string;
        realUserMsgId?: string;
        realThread?: any;
      }>).detail;
      if (!detail || detail.tempId !== threadId) return;
      realThreadIdRef.current = detail.realThreadId;
      realThreadIdResolveRef.current?.(detail.realThreadId);
      // Cập nhật id của user message tạm để không trùng key khi swap cache.
      if (detail.realUserMsgId) {
        setLocalMsgs((prev) => {
          if (!prev.length) return prev;
          const copy = [...prev];
          for (let i = 0; i < copy.length; i++) {
            if (copy[i].role === "user" && copy[i].id?.startsWith("temp-msg-")) {
              copy[i] = { ...copy[i], id: detail.realUserMsgId };
              break;
            }
          }
          return copy;
        });
      }
      // Mark startedRef đã chạy cho temp id, đồng thời cho real id để
      // autostart không chạy lại sau khi navigate replace.
      startedRef.current = detail.realThreadId;
      // Navigate replace sang URL thật, giữ nguyên view (skipReset).
      skipResetRef.current = true;
      navigate({
        to: "/chat/$threadId",
        params: { threadId: detail.realThreadId },
        search: from ? { from } : {},
        replace: true,
      });
    };
    const onFailed = (e: Event) => {
      const detail = (e as CustomEvent<{ tempId: string; error?: string }>).detail;
      if (!detail || detail.tempId !== threadId) return;
      abortRef.current?.abort();
      // Quay lại trang trước đó.
      if (from) {
        try {
          window.location.href = from;
        } catch {}
      } else {
        navigate({ to: "/chat" });
      }
    };
    window.addEventListener("chat:thread-resolved", onResolved as EventListener);
    window.addEventListener("chat:thread-failed", onFailed as EventListener);
    return () => {
      window.removeEventListener("chat:thread-resolved", onResolved as EventListener);
      window.removeEventListener("chat:thread-failed", onFailed as EventListener);
    };
  }, [threadId, isOptimistic, from, navigate]);

  /** Trả về threadId dùng để persist message (đợi nếu đang optimistic). */
  const getEffectiveThreadId = async (): Promise<string> => {
    if (realThreadIdRef.current) return realThreadIdRef.current;
    if (realThreadIdPromiseRef.current) return realThreadIdPromiseRef.current;
    return threadId;
  };


  const messages: ChatMsg[] =
    localMsgs.length > 0
      ? localMsgs
      : (query.data?.messages ?? []).map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          created_at: m.created_at,
          toolEvents: (m.metadata?.toolEvents as ToolEvent[] | undefined) ?? undefined,
          attachments: (m.metadata as any)?.attachments ?? undefined,
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

  const runAssistant = async (
    history: ChatMsg[],
    attachments?: any[],
    bulkRun?: { items: any[] },
  ) => {
    // Hủy stream cũ (nếu có) trước khi bắt đầu, KHÔNG đánh dấu user stop
    // → coi như replacement: bỏ partial assistant cũ.
    if (abortRef.current) {
      const prev = abortRef.current;
      abortRef.current = null;
      try {
        prev.abort();
      } catch {}
    }
    setStreaming(true);
    const controller = new AbortController();
    abortRef.current = controller;
    const working: ChatMsg[] = [
      ...history,
      { role: "assistant", content: "", toolEvents: [], created_at: new Date().toISOString() },
    ];
    setLocalMsgs(working);
    let buffer = "";
    const toolEvents: ToolEvent[] = [];
    let sawProposeAction = false;

    const isCurrent = () => abortRef.current === controller;

    const updateLast = (patch: Partial<ChatMsg>) => {
      if (!isCurrent()) return; // tránh ghi đè khi đã bị replace
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
          ...(bulkRun ? { bulkRun } : {}),
        },
        // TanStack serverFn không forward `signal` trực tiếp — phải override fetch
        // để gắn AbortSignal vào request, nhờ đó server `getRequest()?.signal`
        // và client fetch đều dừng khi user bấm Stop.
        fetch: (input: RequestInfo | URL, init?: RequestInit) =>
          globalThis.fetch(input, { ...(init ?? {}), signal: controller.signal }),
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

      const wasAborted = controller.signal.aborted;
      const wasUserStop = wasAborted && userStoppedRef.current && isCurrent();
      const wasReplaced = wasAborted && !isCurrent();

      if (wasReplaced) return; // bỏ partial, không persist

      if (wasUserStop) {
        buffer = buffer + "\n\n_Đã dừng._";
        updateLast({ content: buffer });
        userStoppedRef.current = false;
      }

      const persistId = await getEffectiveThreadId();
      await appendFn({
        data: {
          threadId: persistId,
          role: "assistant",
          content: buffer,
          metadata: toolEvents.length ? { toolEvents } : undefined,
        },
      });
      qc.invalidateQueries({ queryKey: ["chat", "threads"] });
      qc.invalidateQueries({ queryKey: ["chat", "thread", persistId] });
      if (sawProposeAction) {
        qc.invalidateQueries({ queryKey: ["ai_actions_pending"] });
      }
    } catch (e: any) {
      if (controller.signal.aborted) return;
      const errText = `Lỗi: ${e?.message || "stream error"}`;
      updateLast({ content: errText });
      toast.error(errText);
    } finally {
      if (isCurrent()) {
        setStreaming(false);
        abortRef.current = null;
      }
    }
  };

  useEffect(() => {
    if (!autostart) return;
    if (startedRef.current === threadId) return;
    // Đọc messages từ cache (đã prime) hoặc từ getThread.
    const cached: any =
      qc.getQueryData(["chat", "thread", threadId]) ?? query.data ?? null;
    const msgs = cached?.messages ?? [];
    if (msgs.length === 1 && msgs[0].role === "user") {
      startedRef.current = threadId;
      const hist: ChatMsg[] = msgs.map((m: any) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        created_at: m.created_at,
        attachments: m.metadata?.attachments ?? undefined,
      }));
      let pendingAttachments: any[] | undefined;
      try {
        const raw = sessionStorage.getItem(`__attach:${threadId}`);
        if (raw) {
          pendingAttachments = JSON.parse(raw);
          sessionStorage.removeItem(`__attach:${threadId}`);
        }
      } catch {}
      const declaredAttachments = (msgs[0] as any)?.metadata?.attachments as any[] | undefined;
      if (declaredAttachments?.length && !pendingAttachments?.length) {
        toast.warning("Đã mất nội dung file đính kèm, vui lòng gửi lại file.");
      }
      runAssistant(hist, pendingAttachments);
      // Xoá autostart/optimistic khỏi URL (giữ nguyên id hiện tại, kể cả temp).
      navigate({
        to: "/chat/$threadId",
        params: { threadId },
        search: from ? { from } : {},
        replace: true,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autostart, query.data, threadId, isOptimistic]);

  const sendUserMessage = async (content: string, attachments?: any[]) => {
    const q = content.trim();
    if (!q) return;
    // Cho phép gửi ngay cả khi đang stream — runAssistant sẽ abort & thay thế.
    const baseMsgs = messages.filter(
      (m, i) => !(i === messages.length - 1 && m.role === "assistant"),
    );
    const metaAttachments = attachments?.map((a) => ({
      name: a.name,
      mime: a.mime,
      size: a.size,
      kind: a.kind,
    }));
    const next: ChatMsg[] = [
      ...baseMsgs,
      {
        role: "user",
        content: q,
        created_at: new Date().toISOString(),
        ...(metaAttachments && metaAttachments.length ? { attachments: metaAttachments } : {}),
      },
    ];
    setLocalMsgs(next);
    // Persist user message vào DB (đợi threadId thật nếu đang optimistic).
    void (async () => {
      try {
        const persistId = await getEffectiveThreadId();
        await appendFn({
          data: {
            threadId: persistId,
            role: "user",
            content: q,
            updateTitleIfBlank: true,
            metadata: metaAttachments ? { attachments: metaAttachments } : undefined,
          },
        });
      } catch (e: any) {
        toast.error(e?.message || "Không lưu được tin nhắn");
      }
    })();
    const withBase64 = attachments?.filter((a) => typeof a.base64 === "string" && a.base64);
    runAssistant(next, withBase64 && withBase64.length ? withBase64 : undefined);
  };

  const send = async () => {
    const q = input.trim();
    if (!q) return;
    setInput("");
    await sendUserMessage(q);
  };

  const handleAttach = (payloads: any[], note?: string) => {
    if (!payloads.length) return;
    try {
      sessionStorage.setItem(`__attach:${threadId}`, JSON.stringify(payloads));
    } catch {}
    const summary = payloads.map((p) => `📎 ${p.name}`).join("\n");
    const fallback = `Xử lý ${payloads.length} chứng từ:\n${summary}`;
    // Truyền nguyên payloads (kèm base64) để runAssistant gửi file lên server parse.
    void sendUserMessage(
      note && note.trim() ? note.trim() : fallback,
      payloads,
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
  }, [threadId, messages]);

  // Bulk plan run: user clicked "Chạy kế hoạch" on a BulkIntakeCard.
  useEffect(() => {
    const onRunBulk = (e: Event) => {
      const detail = (e as CustomEvent<{ items: any[] }>).detail;
      if (!detail?.items?.length) return;
      const baseMsgs = messages.filter(
        (m, i) => !(i === messages.length - 1 && m.role === "assistant"),
      );
      const next: ChatMsg[] = [
        ...baseMsgs,
        {
          role: "user",
          content: `__bulk_run__ (${detail.items.length} mục)`,
          created_at: new Date().toISOString(),
        },
      ];
      setLocalMsgs(next);
      void (async () => {
        try {
          const persistId = await getEffectiveThreadId();
          await appendFn({
            data: {
              threadId: persistId,
              role: "user",
              content: `Chạy kế hoạch cho ${detail.items.length} mục.`,
            },
          });
        } catch {}
      })();
      runAssistant(next, undefined, { items: detail.items });
    };
    window.addEventListener("chat:run-bulk-plan", onRunBulk as EventListener);
    return () =>
      window.removeEventListener("chat:run-bulk-plan", onRunBulk as EventListener);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId, messages]);

  const stop = () => {
    if (abortRef.current) {
      userStoppedRef.current = true;
      abortRef.current.abort();
    }
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
    <div className="relative flex flex-1 flex-col overflow-hidden bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,oklch(0.96_0.03_220/0.6),transparent_70%)]">
      <div className="sticky top-0 z-20 border-b border-slate-200/60 bg-white/70 backdrop-blur-xl">
        <div className="mx-auto flex h-12 max-w-3xl items-center gap-2 px-4">
          <SidebarTrigger className="h-8 w-8 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900" />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-sm font-semibold text-slate-800">
              {query.data?.thread.title ?? "Cuộc trò chuyện"}
            </h1>
          </div>
          <span
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-primary-foreground shadow-sm ring-1 ring-white/10"
            style={{ background: "var(--gradient-ai)" }}
            aria-hidden
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" />
            </svg>
          </span>
        </div>
      </div>
      <div ref={scrollRef} className="chat-scroll flex-1 overflow-auto">
        {query.isLoading && messages.length === 0 ? (
          <ChatSkeleton />
        ) : (
          <MessageList
            messages={messages}
            streaming={streaming}
            onRegenerate={!streaming ? regenerate : undefined}
          />
        )}
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
