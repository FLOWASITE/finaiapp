import { useEffect, useRef, useState } from "react";
import { useLocation, useParams } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Sparkles, Send, User, Command as CommandIcon, Paperclip, Loader2 } from "lucide-react";
import { askAccountingStream } from "@/lib/chat.functions";
import { parseDocument } from "@/lib/ai/parse-document.functions";
import { PendingActions } from "@/components/ai/PendingActions";
import { toast } from "sonner";

type Msg = { role: "user" | "assistant"; content: string };

/**
 * Global AI copilot panel. Opens with Cmd/Ctrl+J anywhere in the app.
 * Sends the current route as pageContext so the AI can answer in context.
 */
export function AskAiSheet() {
  const askFn = useServerFn(askAccountingStream);
  const parseFn = useServerFn(parseDocument);
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const location = useLocation();
  const params = useParams({ strict: false }) as Record<string, string | undefined>;
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Keyboard shortcut: Cmd/Ctrl + J
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "j") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    const onOpen = () => setOpen(true);
    window.addEventListener("app:open-ai", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("app:open-ai", onOpen);
    };
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100);
  }, [open]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const pageContext = (() => {
    const path = location.pathname;
    const idParts = Object.entries(params)
      .filter(([, v]) => v)
      .map(([k, v]) => `${k}=${v}`);
    return `Route: ${path}${idParts.length ? ` | Params: ${idParts.join(", ")}` : ""}`;
  })();

  const send = async (q?: string) => {
    const question = (q ?? input).trim();
    if (!question || loading) return;
    setInput("");
    const history = messages;
    setMessages([...history, { role: "user", content: question }, { role: "assistant", content: "" }]);
    setLoading(true);
    try {
      const stream = await askFn({ data: { question, history, pageContext } });
      for await (const chunk of stream as AsyncIterable<{ delta: string }>) {
        setMessages((prev) => {
          const copy = [...prev];
          copy[copy.length - 1] = {
            role: "assistant",
            content: copy[copy.length - 1].content + chunk.delta,
          };
          return copy;
        });
      }
    } catch (e: any) {
      setMessages((prev) => {
        const copy = [...prev];
        copy[copy.length - 1] = { role: "assistant", content: `Lỗi: ${e.message}` };
        return copy;
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Floating trigger button — visible on every page */}
      <button
        onClick={() => setOpen(true)}
        aria-label="Mở trợ lý AI (Cmd+J)"
        className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-2xl shadow-primary/30 transition-transform hover:scale-110"
      >
        <Sparkles className="h-6 w-6" />
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-lg">
          <SheetHeader className="border-b border-border bg-card px-5 py-4">
            <SheetTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-primary" />
              Trợ lý AI
            </SheetTitle>
            <SheetDescription className="flex items-center gap-2 text-xs">
              <span className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono">
                <CommandIcon className="inline h-3 w-3" />+J
              </span>
              <span>để mở/đóng — đang ở: <code className="text-foreground">{location.pathname}</code></span>
            </SheetDescription>
          </SheetHeader>

          <div ref={scrollRef} className="flex-1 overflow-auto p-4">
            {messages.length === 0 ? (
              <div className="space-y-2 text-sm">
                <p className="text-muted-foreground">Hỏi bất cứ điều gì về dữ liệu kế toán/ERP. Một vài gợi ý:</p>
                {[
                  "Tóm tắt tình hình tài chính tháng này",
                  "Top 5 khách hàng nợ lâu nhất",
                  "Tồn kho mặt hàng nào sắp hết?",
                  "Doanh thu tuần này so với tuần trước",
                ].map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="block w-full rounded-lg border border-border bg-card p-3 text-left hover:border-primary hover:bg-accent/5"
                  >
                    {s}
                  </button>
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {messages.map((m, i) => (
                  <div key={i} className={`flex gap-2 ${m.role === "user" ? "justify-end" : ""}`}>
                    {m.role === "assistant" && (
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                        <Sparkles className="h-3.5 w-3.5" />
                      </div>
                    )}
                    <div
                      className={`max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
                        m.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "bg-card border border-border"
                      }`}
                    >
                      {m.content ||
                        (loading && i === messages.length - 1 ? (
                          <span className="text-muted-foreground">Đang truy vấn dữ liệu…</span>
                        ) : null)}
                    </div>
                    {m.role === "user" && (
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary">
                        <User className="h-3.5 w-3.5" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <PendingActions />

          <div className="border-t border-border bg-card p-3">
            <div className="flex gap-2">
              <Input
                ref={inputRef}
                placeholder="Hỏi AI về trang này hoặc dữ liệu bất kỳ…"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && send()}
                disabled={loading}
              />
              <Button onClick={() => send()} disabled={loading || !input.trim()} size="icon">
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

export function openAskAi() {
  window.dispatchEvent(new Event("app:open-ai"));
}
