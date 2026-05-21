import { useEffect, useRef, useState } from "react";
import { useNavigate, Link, useLocation } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { History, Sparkles, MessageSquare, Plus, Trash2, Inbox, Pin, Star, Search, X } from "lucide-react";
import { Composer } from "@/components/chat/composer";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { createThreadWithFirstMessage, listThreads } from "@/lib/chat-threads.functions";
import { countUnreadDigests } from "@/lib/digest-prefs.functions";

function currentThreadId(pathname: string): string | null {
  const m = pathname.match(/^\/chat\/([^/]+)$/);
  return m ? m[1] : null;
}

function collapseChatSidebar() {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem("chat:sidebar-collapsed", "1");
  } catch {}
  window.dispatchEvent(new Event("chat-sidebar-toggle"));
}

/**
 * Khung chat dock ở footer các trang trong Mode AI.
 * Composer đã tích hợp sẵn Paperclip (parse chứng từ) và Mic (Web Speech).
 */
const DRAFT_KEY = "__chatDockDraft";

export function ChatDock() {
  const [input, setInputState] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    try {
      return sessionStorage.getItem(DRAFT_KEY) ?? "";
    } catch {
      return "";
    }
  });
  const setInput = (v: string) => {
    setInputState(v);
    try {
      if (v) sessionStorage.setItem(DRAFT_KEY, v);
      else sessionStorage.removeItem(DRAFT_KEY);
    } catch {}
  };
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();
  const createWithMsgFn = useServerFn(createThreadWithFirstMessage);
  const listFn = useServerFn(listThreads);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyTab, setHistoryTab] = useState<"all" | "general" | "inbox">("all");
  const [historySearch, setHistorySearch] = useState("");

  const threadsQuery = useQuery({
    queryKey: ["chat", "threads", "recent", "all"],
    queryFn: () => listFn({ data: { kind: "all" } }),
    staleTime: 15_000,
    enabled: historyOpen,
  });

  // ---- Daily digest badge ----
  const SEEN_KEY = "__digestSeenAt";
  const countUnreadFn = useServerFn(countUnreadDigests);
  const [seenAt, setSeenAt] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    try { return localStorage.getItem(SEEN_KEY) ?? ""; } catch { return ""; }
  });
  const unreadQuery = useQuery({
    queryKey: ["digest", "unread", seenAt],
    queryFn: () => countUnreadFn({ data: { since: seenAt || undefined } }),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
  const unreadCount = unreadQuery.data?.count ?? 0;
  const latestDigestThreadId = unreadQuery.data?.latest_thread_id ?? null;
  const markSeen = () => {
    const now = new Date().toISOString();
    setSeenAt(now);
    try { localStorage.setItem(SEEN_KEY, now); } catch {}
  };


  const activeThreadId = currentThreadId(location.pathname);

  // Full path (pathname + search + hash) so the back button restores
  // filters/tabs of the page the user came from. Skip when already inside /chat.
  const fromHref = location.pathname.startsWith("/chat")
    ? undefined
    : (location as any).href ?? location.pathname;

  useEffect(() => {
    const focusInput = () => {
      setTimeout(() => inputRef.current?.focus(), 50);
    };
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "j") {
        e.preventDefault();
        focusInput();
      }
    };
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent<{ prefill?: string }>).detail;
      if (detail?.prefill) setInput(detail.prefill);
      focusInput();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("app:open-ai", onOpen as EventListener);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("app:open-ai", onOpen as EventListener);
    };
  }, []);

  const submit = async (override?: string) => {
    const q = (override ?? input).trim();
    if (!q || loading) return;
    const existingThreadId = currentThreadId(location.pathname);
    if (existingThreadId) {
      setInput("");
      window.dispatchEvent(
        new CustomEvent("chat:dock-send", {
          detail: { threadId: existingThreadId, content: q },
        }),
      );
      return;
    }
    // No active thread: clear input + show loading IMMEDIATELY,
    // then create thread in background and navigate when ready.
    setInput("");
    setLoading(true);
    createWithMsgFn({ data: { title: q.slice(0, 60), content: q } })
      .then((res) => {
        // Prime caches so the thread page renders instantly (no spinner, no refetch).
        qc.setQueryData(["chat", "thread", res.thread.id], {
          thread: res.thread,
          messages: [res.message],
        });
        qc.setQueryData(
          ["chat", "threads", "recent", "all"],
          (prev: any) => (Array.isArray(prev) ? [res.thread, ...prev] : [res.thread]),
        );
        collapseChatSidebar();
        navigate({
          to: "/chat/$threadId",
          params: { threadId: res.thread.id },
          search: fromHref ? { autostart: "1", from: fromHref } : { autostart: "1" },
        });
      })
      .catch((e: any) => {
        setInput(q); // rollback draft
        toast.error(e?.message || "Không gửi được");
      })
      .finally(() => setLoading(false));
  };

  const handleAttach = async (payloads: any[], note?: string) => {
    if (!payloads.length || loading) return;
    const existingThreadId = currentThreadId(location.pathname);
    const fallback = `Xử lý ${payloads.length} chứng từ:\n${payloads.map((p) => `📎 ${p.name}`).join("\n")}`;
    const content = note && note.trim() ? note.trim() : fallback;
    if (existingThreadId) {
      try {
        sessionStorage.setItem(`__attach:${existingThreadId}`, JSON.stringify(payloads));
      } catch {}
      window.dispatchEvent(
        new CustomEvent("chat:dock-send", {
          detail: {
            threadId: existingThreadId,
            content,
            attachments: payloads.map((p) => ({
              name: p.name,
              mime: p.mime,
              size: p.size,
              kind: p.kind,
            })),
          },
        }),
      );
      return;
    }
    setLoading(true);

    const metaAttachments = payloads.map((p) => ({

      name: p.name,
      mime: p.mime,
      size: p.size,
      kind: p.kind,
    }));
    createWithMsgFn({
      data: {
        title: payloads[0].name.slice(0, 60),
        content,
        metadata: { attachments: metaAttachments },
      },
    })
      .then((res) => {
        try {
          sessionStorage.setItem(`__attach:${res.thread.id}`, JSON.stringify(payloads));
        } catch {}
        qc.setQueryData(["chat", "thread", res.thread.id], {
          thread: res.thread,
          messages: [res.message],
        });
        qc.setQueryData(
          ["chat", "threads", "recent", "all"],
          (prev: any) => (Array.isArray(prev) ? [res.thread, ...prev] : [res.thread]),
        );
        collapseChatSidebar();
        navigate({
          to: "/chat/$threadId",
          params: { threadId: res.thread.id },
          search: fromHref ? { autostart: "1", from: fromHref } : { autostart: "1" },
        });
      })
      .catch((e: any) => {
        toast.error(e?.message || "Không gửi được");
      })
      .finally(() => setLoading(false));
  };

  return (
    <>
      <button
        type="button"
        onClick={() => inputRef.current?.focus()}
        aria-label="Hỏi trợ lý AI (Cmd+J)"
        title="Hỏi trợ lý AI (Cmd+J)"
        className="fixed bottom-24 right-6 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-2xl shadow-primary/30 transition-transform hover:scale-110 active:scale-95 md:hidden"
      >
        <Sparkles className="h-5 w-5" />
      </button>
      <div className="pointer-events-none sticky bottom-0 z-30 px-4 pb-4">
        <div className="pointer-events-auto mx-auto flex max-w-3xl items-end gap-2">
          <div className="flex-1">
            <Composer
              value={input}
              onChange={setInput}
              onSubmit={() => submit()}
              onTranscript={(t) => submit(t)}
              onAttach={handleAttach}
              loading={loading}
              placeholder="Hỏi trợ lý AI bất cứ điều gì… (Cmd+J)"
              compact
              inputRef={inputRef}
            />
          </div>
          {input.trim() && (
            <Button
              variant="outline"
              size="icon"
              onClick={() => {
                setInput("");
                inputRef.current?.focus();
                toast.success("Đã xoá bản nháp");
              }}
              className="h-11 w-11 shrink-0 rounded-xl border-white/10 bg-background/70 backdrop-blur-xl"
              title="Xoá bản nháp"
              aria-label="Xoá bản nháp"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
          {unreadCount > 0 && latestDigestThreadId && (
            <Button
              variant="outline"
              size="icon"
              onClick={() => {
                markSeen();
                navigate({ to: "/chat/$threadId", params: { threadId: latestDigestThreadId } });
              }}
              className="relative h-11 w-11 shrink-0 rounded-xl border-primary/40 bg-primary/10 text-primary backdrop-blur-xl"
              title={`Có ${unreadCount} tóm tắt chưa đọc`}
              aria-label="Tóm tắt hàng ngày"
            >
              <Sparkles className="h-4 w-4" />
              <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            </Button>
          )}
          <Popover open={historyOpen} onOpenChange={(o) => { setHistoryOpen(o); if (o) markSeen(); }}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="h-11 w-11 shrink-0 rounded-xl border-white/10 bg-background/70 backdrop-blur-xl"
                title="Hội thoại gần đây"
                aria-label="Hội thoại gần đây"
              >
                <History className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              side="top"
              className="w-80 p-0 border-white/10 bg-background/95 backdrop-blur-xl"
            >
              <div className="flex items-center justify-between border-b border-white/5 px-3 py-2">
                <span className="text-xs font-medium text-muted-foreground">
                  Hội thoại gần đây
                </span>
                <Button
                  asChild
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 px-2 text-xs"
                  onClick={() => setHistoryOpen(false)}
                >
                  <Link to="/chat">
                    <Plus className="h-3 w-3" />
                    Mới
                  </Link>
                </Button>
              </div>
              <div className="flex items-center gap-1 border-b border-white/5 px-2 py-1.5">
                {(
                  [
                    { k: "all", label: "Tất cả" },
                    { k: "general", label: "Trò chuyện" },
                    { k: "inbox", label: "Inbox" },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.k}
                    type="button"
                    onClick={() => setHistoryTab(tab.k)}
                    className={`rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                      historyTab === tab.k
                        ? "bg-white/10 text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              <div className="border-b border-white/5 px-2 py-1.5">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground/60" />
                  <input
                    type="text"
                    value={historySearch}
                    onChange={(e) => setHistorySearch(e.target.value)}
                    placeholder="Tìm theo tiêu đề…"
                    className="h-7 w-full rounded-md border border-white/10 bg-background/60 pl-7 pr-6 text-[11px] outline-none transition-colors focus:border-primary/40"
                  />
                  {historySearch && (
                    <button
                      type="button"
                      onClick={() => setHistorySearch("")}
                      aria-label="Xoá tìm kiếm"
                      className="absolute right-1 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:bg-white/10 hover:text-foreground"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>
              <ScrollArea className="max-h-80">
                <div className="p-1">
                  {(() => {
                    const all = threadsQuery.data ?? [];
                    const sq = historySearch.trim().toLowerCase();
                    const filtered = all.filter((t) => {
                      if (historyTab === "inbox" && t.kind !== "inbox") return false;
                      if (historyTab === "general" && t.kind === "inbox") return false;
                      if (sq && !(t.title ?? "").toLowerCase().includes(sq)) return false;
                      return true;
                    });
                    if (threadsQuery.isLoading) {
                      return (
                        <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                          Đang tải…
                        </div>
                      );
                    }
                    if (!filtered.length) {
                      return (
                        <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                          {sq
                            ? `Không tìm thấy “${historySearch.trim()}”`
                            : historyTab === "inbox"
                              ? "Chưa có phiên Inbox nào"
                              : "Chưa có hội thoại nào"}
                        </div>
                      );
                    }
                    return filtered.slice(0, 30).map((t) => {
                      const isActive = t.id === activeThreadId;
                      const isInbox = t.kind === "inbox";
                      const when = t.last_message_at
                        ? new Date(t.last_message_at).toLocaleString("vi-VN", {
                            hour: "2-digit",
                            minute: "2-digit",
                            day: "2-digit",
                            month: "2-digit",
                          })
                        : "";
                      return (
                        <Link
                          key={t.id}
                          to="/chat/$threadId"
                          params={{ threadId: t.id }}
                          onClick={() => setHistoryOpen(false)}
                          className={`flex items-start gap-2 rounded-lg px-2 py-2 text-sm hover:bg-white/5 ${
                            isActive ? "bg-white/5" : ""
                          }`}
                        >
                          {isInbox ? (
                            <Inbox className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary/80" />
                          ) : (
                            <MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="truncate font-medium">
                                {t.title || "(Không tiêu đề)"}
                              </span>
                              {t.starred && (
                                <Star className="h-3 w-3 shrink-0 fill-amber-500 text-amber-500" />
                              )}
                              {t.pinned_at && (
                                <Pin className="h-3 w-3 shrink-0 text-primary/70" />
                              )}
                              {isInbox && (
                                <span className="shrink-0 rounded bg-primary/10 px-1 py-px text-[9px] font-semibold uppercase tracking-wide text-primary">
                                  Inbox
                                </span>
                              )}
                            </div>
                            {when && (
                              <div className="text-[10px] text-muted-foreground">
                                {when}
                              </div>
                            )}
                          </div>
                        </Link>
                      );
                    });
                  })()}
                </div>
              </ScrollArea>
            </PopoverContent>
          </Popover>
        </div>
      </div>
    </>
  );
}
