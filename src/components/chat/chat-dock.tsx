import { useEffect, useRef, useState } from "react";
import { useNavigate, Link, useLocation } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { History, Sparkles, MessageSquare, Plus, Trash2 } from "lucide-react";
import { Composer } from "@/components/chat/composer";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { createThread, appendMessage, listThreads } from "@/lib/chat-threads.functions";

function currentThreadId(pathname: string): string | null {
  const m = pathname.match(/^\/chat\/([^/]+)$/);
  return m ? m[1] : null;
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
  const createFn = useServerFn(createThread);
  const appendFn = useServerFn(appendMessage);
  const listFn = useServerFn(listThreads);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  const threadsQuery = useQuery({
    queryKey: ["chat", "threads", "recent"],
    queryFn: () => listFn(),
    staleTime: 15_000,
    enabled: historyOpen,
  });

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
    setLoading(true);
    try {
      if (existingThreadId) {
        setInput("");
        window.dispatchEvent(
          new CustomEvent("chat:dock-send", {
            detail: { threadId: existingThreadId, content: q },
          }),
        );
        return;
      }
      const thread = await createFn({ data: { title: q.slice(0, 60) } });
      await appendFn({
        data: { threadId: thread.id, role: "user", content: q, updateTitleIfBlank: true },
      });
      setInput("");
      navigate({
        to: "/chat/$threadId",
        params: { threadId: thread.id },
        search: fromHref ? { autostart: "1", from: fromHref } : { autostart: "1" },
      });
    } catch (e: any) {
      toast.error(e?.message || "Không gửi được");
    } finally {
      setLoading(false);
    }
  };

  const handleAttach = async (payloads: any[]) => {
    if (!payloads.length || loading) return;
    const existingThreadId = currentThreadId(location.pathname);
    setLoading(true);
    try {
      if (existingThreadId) {
        try {
          sessionStorage.setItem(`__attach:${existingThreadId}`, JSON.stringify(payloads));
        } catch {}
        window.dispatchEvent(
          new CustomEvent("chat:dock-send", {
            detail: {
              threadId: existingThreadId,
              content: `Xử lý ${payloads.length} chứng từ:\n${payloads
                .map((p) => `📎 ${p.name}`)
                .join("\n")}`,
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
      const summary = payloads.map((p) => `📎 ${p.name}`).join("\n");
      const thread = await createFn({ data: { title: payloads[0].name.slice(0, 60) } });
      await appendFn({
        data: {
          threadId: thread.id,
          role: "user",
          content: `Xử lý ${payloads.length} chứng từ:\n${summary}`,
          updateTitleIfBlank: true,
          metadata: {
            attachments: payloads.map((p) => ({
              name: p.name,
              mime: p.mime,
              size: p.size,
              kind: p.kind,
            })),
          },
        },
      });
      try {
        sessionStorage.setItem(`__attach:${thread.id}`, JSON.stringify(payloads));
      } catch {}
      navigate({
        to: "/chat/$threadId",
        params: { threadId: thread.id },
        search: fromHref ? { autostart: "1", from: fromHref } : { autostart: "1" },
      });
    } catch (e: any) {
      toast.error(e?.message || "Không gửi được");
    } finally {
      setLoading(false);
    }
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
          <Popover open={historyOpen} onOpenChange={setHistoryOpen}>
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
              <ScrollArea className="max-h-80">
                <div className="p-1">
                  {threadsQuery.isLoading ? (
                    <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                      Đang tải…
                    </div>
                  ) : threadsQuery.data && threadsQuery.data.length > 0 ? (
                    threadsQuery.data.slice(0, 30).map((t) => {
                      const isActive = t.id === activeThreadId;
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
                          <MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          <div className="min-w-0 flex-1">
                            <div className="truncate font-medium">
                              {t.title || "(Không tiêu đề)"}
                            </div>
                            {when && (
                              <div className="text-[10px] text-muted-foreground">
                                {when}
                              </div>
                            )}
                          </div>
                        </Link>
                      );
                    })
                  ) : (
                    <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                      Chưa có hội thoại nào
                    </div>
                  )}
                </div>
              </ScrollArea>
            </PopoverContent>
          </Popover>
        </div>
      </div>
    </>
  );
}
