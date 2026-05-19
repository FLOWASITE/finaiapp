import { useEffect, useRef, useState } from "react";
import { useNavigate, Link, useLocation } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { History, Sparkles } from "lucide-react";
import { Composer } from "@/components/chat/composer";
import { Button } from "@/components/ui/button";
import { createThread, appendMessage } from "@/lib/chat-threads.functions";

function currentThreadId(pathname: string): string | null {
  const m = pathname.match(/^\/chat\/([^/]+)$/);
  return m ? m[1] : null;
}

/**
 * Khung chat dock ở footer các trang trong Mode AI.
 * Composer đã tích hợp sẵn Paperclip (parse chứng từ) và Mic (Web Speech).
 */
export function ChatDock() {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const createFn = useServerFn(createThread);
  const appendFn = useServerFn(appendMessage);
  const inputRef = useRef<HTMLTextAreaElement>(null);

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
    setLoading(true);
    try {
      const thread = await createFn({ data: { title: q.slice(0, 60) } });
      await appendFn({
        data: { threadId: thread.id, role: "user", content: q, updateTitleIfBlank: true },
      });
      setInput("");
      navigate({
        to: "/chat/$threadId",
        params: { threadId: thread.id },
        search: { autostart: "1" },
      });
    } catch (e: any) {
      toast.error(e?.message || "Không gửi được");
    } finally {
      setLoading(false);
    }
  };

  const handleAttach = async (payloads: any[]) => {
    if (!payloads.length || loading) return;
    setLoading(true);
    try {
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
        search: { autostart: "1" },
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
          <Button
            asChild
            variant="outline"
            size="icon"
            className="h-11 w-11 shrink-0 rounded-xl border-white/10 bg-background/70 backdrop-blur-xl"
            title="Lịch sử hội thoại"
          >
            <Link to="/chat" aria-label="Lịch sử hội thoại">
              <History className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    </>
  );
}
