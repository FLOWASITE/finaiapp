import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, ArrowDown } from "lucide-react";
import { z } from "zod";
import { zodValidator } from "@tanstack/zod-adapter";
import { Composer } from "@/components/chat/composer";
import { MessageList, type ChatMsg } from "@/components/chat/message-list";
import { ChatSkeleton } from "@/components/chat/chat-skeleton";
import { ChatHeader } from "@/components/chat/chat-header";
import { Button } from "@/components/ui/button";
import { PendingActions } from "@/components/ai/PendingActions";
import { getThread, appendMessage, deleteLastAssistantMessage } from "@/lib/chat-threads.functions";
import { askAccountingStream } from "@/lib/chat.functions";
import { getChatMode } from "@/hooks/use-chat-mode";
import type { ToolEvent } from "@/components/chat/tool-calls";

import { toast } from "sonner";
import { takeAnyChatAttachmentHandoff, takeChatAttachments } from "@/lib/chat-attachment-handoff";
import {
  awaitThreadCreation,
  getThreadCreationResult,
  getThreadCreationRetry,
  clearThreadCreationResult,
} from "@/lib/chat-thread-handoff";

const searchSchema = z.object({
  autostart: z.string().optional(),
  from: z.string().optional(),
  optimistic: z.string().optional(),
  pending: z.string().optional(),
  handoff: z.string().optional(),
});

export const Route = createFileRoute("/_app/chat/$threadId")({
  validateSearch: zodValidator(searchSchema),
  component: ThreadPage,
});

function ThreadPage() {
  const { threadId } = Route.useParams();
  const { autostart, handoff, pending } = Route.useSearch();
  const qc = useQueryClient();
  const getFn = useServerFn(getThread);
  const appendFn = useServerFn(appendMessage);
  const askFn = useServerFn(askAccountingStream);
  const deleteLastFn = useServerFn(deleteLastAssistantMessage);
  // Khi vào thread từ ChatDock (có autostart) trên Desktop: mở History sidebar
  // cho chat. KHÔNG dùng useSidebar() vì route có thể bị mount trong layout
  // chromeless (ví dụ điều hướng từ /inbox) — sẽ crash thread + làm mất
  // ngữ cảnh file attach trong sessionStorage.
  useEffect(() => {
    if (!autostart) return;
    if (typeof window === "undefined") return;
    const isDesktop = window.matchMedia("(min-width: 768px)").matches;
    if (!isDesktop) return;
    try {
      localStorage.setItem("chat:sidebar-collapsed", "0");
    } catch {}
    window.dispatchEvent(new Event("chat-sidebar-toggle"));
  }, [autostart]);

  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [localMsgs, setLocalMsgs] = useState<ChatMsg[]>([]);
  // When ChatDock navigates optimistically the thread row does not exist
  // server-side yet. We wait for the background insert to finish before
  // enabling the getThread query (otherwise it would 404 and clobber the
  // primed optimistic cache).
  const [creationSettled, setCreationSettled] = useState<boolean>(() => !pending);
  const [creationError, setCreationError] = useState<Error | null>(null);
  const [retrying, setRetrying] = useState(false);
  // Khi user reload trang trong lúc thread đang được tạo nền, in-memory
  // promise store (window) bị xoá → awaitThreadCreation resolve ngay, getThread
  // trả notFound. Cho phép page đợi thêm ~30s polling thay vì show "Không
  // tìm thấy" liền.
  const pendingDeadlineRef = useRef<number>(pending ? Date.now() + 30_000 : 0);
  const [pendingExpired, setPendingExpired] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const startedRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  // Đánh dấu lần abort kế tiếp là do user nhấn Stop (giữ partial + marker)
  // hay do replacement (huỷ và bỏ partial).
  const userStoppedRef = useRef(false);
  const [atBottom, setAtBottom] = useState(true);
  const [hasNew, setHasNew] = useState(false);

  useEffect(() => {
    if (!pending) {
      setCreationSettled(true);
      return;
    }
    let cancelled = false;
    awaitThreadCreation(threadId).finally(() => {
      if (cancelled) return;
      const res = getThreadCreationResult(threadId);
      if (res && !res.ok) {
        setCreationError(res.error);
        setCreationSettled(false); // chặn getThread chạy → tránh 404 nhiễu
      } else {
        // Dù không có promise (vd: user vừa reload trang → window state đã mất)
        // vẫn cho phép getThread chạy; polling bên dưới sẽ chờ row xuất hiện.
        setCreationError(null);
        setCreationSettled(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [pending, threadId]);

  const retryCreation = async () => {
    const retry = getThreadCreationRetry(threadId);
    if (!retry) {
      // Không có factory (vd user reload trang) → chỉ thử lại getThread.
      clearThreadCreationResult(threadId);
      setCreationError(null);
      setCreationSettled(true);
      pendingDeadlineRef.current = Date.now() + 30_000;
      setPendingExpired(false);
      return;
    }
    setRetrying(true);
    try {
      await retry();
      setCreationError(null);
      setCreationSettled(true);
    } catch (e: any) {
      setCreationError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setRetrying(false);
    }
  };

  const query = useQuery({
    queryKey: ["chat", "thread", threadId],
    queryFn: () => getFn({ data: { threadId } }),
    staleTime: 30_000,
    enabled: creationSettled && !creationError,
    // Khi đang ở giai đoạn pending (vừa điều hướng optimistic hoặc user reload
    // trong lúc background insert đang chạy) và server vẫn trả notFound → tiếp
    // tục poll mỗi 1s tới khi quá hạn.
    refetchInterval: (q) => {
      if (!pending || pendingExpired) return false;
      const data: any = q.state.data;
      if (data && data.notFound) return 1000;
      return false;
    },
  });

  // Khi quá hạn chờ tạo thread → dừng polling và hiển thị notFound thật.
  useEffect(() => {
    if (!pending || pendingExpired) return;
    if (!query.data?.notFound) return;
    const remaining = pendingDeadlineRef.current - Date.now();
    if (remaining <= 0) {
      setPendingExpired(true);
      return;
    }
    const t = setTimeout(() => setPendingExpired(true), remaining);
    return () => clearTimeout(t);
  }, [pending, pendingExpired, query.data]);

  useEffect(() => {
    setLocalMsgs([]);
    setInput("");
    startedRef.current = null;
    userStoppedRef.current = false;
    abortRef.current?.abort();
    abortRef.current = null;
  }, [threadId]);

  /** Trả về threadId dùng để persist message. Khi ChatDock điều hướng optimistic,
   * thread chưa tồn tại server-side → đợi background creation xong trước. */
  const getEffectiveThreadId = async (): Promise<string> => {
    await awaitThreadCreation(threadId);
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
          mode: getChatMode(),
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
        } else if (ev.type === "tool-progress") {
          toolEvents.push(ev);
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
      // Strip transient progress events before persisting — they're only for live UI.
      const persistedToolEvents = toolEvents.filter((e: any) => e.type !== "tool-progress");
      await appendFn({
        data: {
          threadId: persistId,
          role: "assistant",
          content: buffer,
          metadata: persistedToolEvents.length ? { toolEvents: persistedToolEvents } : undefined,
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
    const cached: any = qc.getQueryData(["chat", "thread", threadId]) ?? query.data ?? null;
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
      const pendingAttachments =
        takeChatAttachments(handoff, [`__attach:${threadId}`]) ?? takeAnyChatAttachmentHandoff();
      const declaredAttachments = (msgs[0] as any)?.metadata?.attachments as any[] | undefined;
      const attachmentsForRun = pendingAttachments?.length
        ? pendingAttachments
        : declaredAttachments;
      if (declaredAttachments?.length && !attachmentsForRun?.length) {
        toast.error(
          "Mất nội dung file đính kèm khi chuyển sang hội thoại. Vui lòng gửi lại file trong phòng chat này.",
        );
        setLocalMsgs((prev) => [
          ...prev,
          {
            role: "assistant",
            content:
              "Tôi không nhận được nội dung file vì dữ liệu bị mất khi chuyển trang. Sếp đính kèm lại file ở đây giúp em nhé.",
            created_at: new Date().toISOString(),
          },
        ]);
        return;
      }
      runAssistant(hist, attachmentsForRun);
      // KHÔNG navigate replace để xoá autostart ở đây — sẽ gây re-render +
      // Route.useSearch đổi → trông như refresh. startedRef đã chặn chạy lại.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autostart, query.data, threadId, handoff]);

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
      uploadId: a.uploadId ?? null,
      file_hash: a.file_hash ?? null,
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
    // Persist user message vào DB.
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
    const runnableAttachments = attachments?.filter(
      (a) => (typeof a.base64 === "string" && a.base64) || a.uploadId,
    );
    runAssistant(
      next,
      runnableAttachments && runnableAttachments.length ? runnableAttachments : undefined,
    );
  };

  const send = async () => {
    const q = input.trim();
    if (!q) return;
    setInput("");
    await sendUserMessage(q);
  };

  const handleAttach = (payloads: any[], note?: string) => {
    if (!payloads.length) return;
    const summary = payloads.map((p) => `📎 ${p.name}`).join("\n");
    const fallback = `Xử lý ${payloads.length} chứng từ:\n${summary}`;
    // Truyền nguyên payloads (kèm base64) để runAssistant gửi file lên server parse.
    void sendUserMessage(note && note.trim() ? note.trim() : fallback, payloads);
  };

  useEffect(() => {
    const onDockSend = (e: Event) => {
      const detail = (
        e as CustomEvent<{
          threadId: string;
          content: string;
          attachments?: any[];
          handoff?: string;
        }>
      ).detail;
      if (!detail || detail.threadId !== threadId) return;
      const fullAttachments = takeChatAttachments(detail.handoff, [`__attach:${threadId}`]);
      void sendUserMessage(detail.content, fullAttachments ?? detail.attachments);
    };
    window.addEventListener("chat:dock-send", onDockSend as EventListener);
    return () => window.removeEventListener("chat:dock-send", onDockSend as EventListener);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId, messages]);

  // Edit/Resend từ hover-actions trên user message bubble.
  useEffect(() => {
    const onEdit = (e: Event) => {
      const detail = (e as CustomEvent<{ content: string }>).detail;
      if (!detail?.content) return;
      setInput(detail.content);
    };
    const onResend = (e: Event) => {
      const detail = (e as CustomEvent<{ content: string }>).detail;
      if (!detail?.content) return;
      void sendUserMessage(detail.content);
    };
    window.addEventListener("chat:edit-user-msg", onEdit as EventListener);
    window.addEventListener("chat:resend-user-msg", onResend as EventListener);
    return () => {
      window.removeEventListener("chat:edit-user-msg", onEdit as EventListener);
      window.removeEventListener("chat:resend-user-msg", onResend as EventListener);
    };
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
    return () => window.removeEventListener("chat:run-bulk-plan", onRunBulk as EventListener);
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

  if (creationError) {
    return (
      <div className="flex flex-1 items-center justify-center px-4">
        <div className="max-w-sm rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center">
          <AlertTriangle className="mx-auto mb-2 h-6 w-6 text-destructive" />
          <p className="mb-1 text-sm font-medium">Không tạo được cuộc trò chuyện</p>
          <p className="mb-4 text-xs text-muted-foreground">
            {creationError.message || "Đã xảy ra lỗi khi lưu hội thoại lên máy chủ."}
          </p>
          <Button size="sm" onClick={retryCreation} disabled={retrying}>
            {retrying ? "Đang thử lại…" : "Thử lại"}
          </Button>
        </div>
      </div>
    );
  }

  if (query.data?.notFound) {
    // Đang trong giai đoạn pending (vừa điều hướng optimistic hoặc user reload
    // trang khi background insert chưa xong) → hiển thị trạng thái chuẩn bị,
    // refetchInterval sẽ tự poll đến khi thấy row hoặc hết hạn.
    if (pending && !pendingExpired) {
      return (
        <div className="flex flex-1 items-center justify-center px-4">
          <div className="max-w-sm rounded-xl border border-border/70 bg-background p-6 text-center shadow-sm">
            <div className="mx-auto mb-3 h-6 w-6 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
            <p className="mb-1 text-sm font-medium">Đang chuẩn bị cuộc trò chuyện…</p>
            <p className="text-xs text-muted-foreground">
              Hệ thống đang lưu hội thoại lên máy chủ, chờ vài giây nhé.
            </p>
          </div>
        </div>
      );
    }
    return (
      <div className="flex flex-1 items-center justify-center px-4">
        <div className="max-w-sm rounded-xl border border-border/70 bg-background p-6 text-center shadow-sm">
          <AlertTriangle className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
          <p className="mb-1 text-sm font-medium">Không tìm thấy cuộc trò chuyện</p>
          <p className="mb-4 text-xs text-muted-foreground">
            Hội thoại này chưa được tạo xong, đã bị xoá hoặc không thuộc doanh nghiệp hiện tại.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              pendingDeadlineRef.current = Date.now() + 30_000;
              setPendingExpired(false);
              query.refetch();
            }}
          >
            Tải lại
          </Button>
        </div>
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center">
          <AlertTriangle className="mx-auto mb-2 h-6 w-6 text-destructive" />
          <p className="mb-3 text-sm">
            {(query.error as any)?.message || "Không tải được hội thoại"}
          </p>
          <Button variant="outline" size="sm" onClick={() => query.refetch()}>
            Thử lại
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,oklch(0.96_0.03_220/0.6),transparent_70%)]">
      <ChatHeader title={query.data?.thread?.title ?? "Cuộc trò chuyện"} />

      <div ref={scrollRef} className="chat-scroll flex-1 overflow-auto pt-12 -mt-12">
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
        <div className="pointer-events-none absolute inset-x-0 -top-16 h-16 chat-footer-fade" />
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
