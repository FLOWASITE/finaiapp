import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Sparkles, Maximize2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Composer } from "@/components/chat/composer";
import { MessageList, type ChatMsg } from "@/components/chat/message-list";
import { Button } from "@/components/ui/button";
import { askAccountingStream } from "@/lib/chat.functions";
import type { ToolEvent } from "@/components/chat/tool-calls";

const SUGGESTIONS = [
  "Tóm tắt các đề xuất chờ duyệt hôm nay",
  "Đối chiếu hoá đơn với sao kê tuần này",
  "Hạch toán hết Grab vào TK 642",
  "Tìm hoá đơn chưa khớp >5 triệu",
];

/**
 * Embedded chat panel that lives as the left half of the AI Inbox screen.
 * Stateless across reloads — for deep history use /chat/$threadId.
 */
export function InboxChatPanel() {
  const askFn = useServerFn(askAccountingStream);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Listen for inbox→chat prefill events.
  useEffect(() => {
    const onPrefill = (e: Event) => {
      const detail = (e as CustomEvent<{ prefill?: string; auto?: boolean }>).detail;
      if (!detail?.prefill) return;
      if (detail.auto) {
        void sendUser(detail.prefill);
      } else {
        setInput(detail.prefill);
      }
    };
    window.addEventListener("inbox-chat:prefill", onPrefill as EventListener);
    return () => window.removeEventListener("inbox-chat:prefill", onPrefill as EventListener);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: streaming ? "auto" : "smooth" });
  }, [messages, streaming]);

  const runAssistant = async (history: ChatMsg[]) => {
    setStreaming(true);
    const controller = new AbortController();
    abortRef.current = controller;
    let buffer = "";
    const toolEvents: ToolEvent[] = [];
    const working: ChatMsg[] = [...history, { role: "assistant", content: "", toolEvents: [] }];
    setMessages(working);

    const updateLast = (patch: Partial<ChatMsg>) => {
      setMessages((prev) => {
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
        } else if (ev.type === "tool-call" || ev.type === "tool-result") {
          toolEvents.push(ev);
          updateLast({ toolEvents: [...toolEvents] });
        }
      }
    } catch (e: any) {
      if (!controller.signal.aborted) {
        updateLast({ content: `Lỗi: ${e?.message || "stream error"}` });
        toast.error(e?.message || "stream error");
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  };

  const sendUser = async (content: string) => {
    const q = content.trim();
    if (!q || streaming) return;
    const next: ChatMsg[] = [...messages, { role: "user", content: q }];
    setInput("");
    await runAssistant(next);
  };

  const stop = () => abortRef.current?.abort();
  const reset = () => {
    abortRef.current?.abort();
    setMessages([]);
    setInput("");
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-gradient-to-b from-card/30 to-background">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border/40 px-4 py-3">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Sparkles className="h-3.5 w-3.5" />
        </div>
        <div>
          <div className="text-sm font-semibold tracking-tight">Trợ lý AI</div>
          <div className="text-[10px] text-muted-foreground">
            Hỏi bất cứ điều gì về kế toán, hoá đơn, sao kê
          </div>
        </div>
        <div className="ml-auto flex items-center gap-1">
          {messages.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={reset}
              className="h-7 gap-1 px-2 text-[11px] text-muted-foreground"
              title="Hội thoại mới"
            >
              <RotateCcw className="h-3 w-3" /> Mới
            </Button>
          )}
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-[11px] text-muted-foreground"
            title="Mở hội thoại đầy đủ"
          >
            <Link to="/chat">
              <Maximize2 className="h-3 w-3" /> Mở rộng
            </Link>
          </Button>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="chat-scroll min-h-0 flex-1 overflow-auto">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Sparkles className="h-5 w-5" />
            </div>
            <div className="space-y-1">
              <div className="text-sm font-medium">Chào! Tôi giúp gì cho bạn?</div>
              <div className="text-xs text-muted-foreground">
                Chọn nhanh một câu, hoặc gõ câu hỏi của bạn.
              </div>
            </div>
            <div className="grid w-full max-w-sm gap-1.5">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => void sendUser(s)}
                  className="rounded-md border border-border/40 bg-card/60 px-3 py-2 text-left text-xs text-foreground/80 transition hover:border-primary/30 hover:bg-primary/5 hover:text-foreground"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <MessageList messages={messages} streaming={streaming} />
        )}
      </div>

      {/* Composer */}
      <div className="shrink-0 border-t border-border/40 bg-background/80 p-3 backdrop-blur-xl">
        <Composer
          value={input}
          onChange={setInput}
          onSubmit={() => sendUser(input)}
          onStop={stop}
          loading={streaming}
          placeholder="Hỏi trợ lý AI…"
          compact
        />
        <p className="mt-2 text-center text-[10px] text-muted-foreground/60">
          AI có thể sai sót — hãy kiểm tra số liệu quan trọng.
        </p>
      </div>
    </div>
  );
}

/** Helper: send text to the inbox chat panel (optionally auto-submit). */
export function sendToInboxChat(prefill: string, auto = false) {
  window.dispatchEvent(
    new CustomEvent("inbox-chat:prefill", { detail: { prefill, auto } }),
  );
}
