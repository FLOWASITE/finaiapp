import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { askAccounting } from "@/lib/chat.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, Sparkles, User } from "lucide-react";

export const Route = createFileRoute("/_app/chat")({
  component: Chat,
});

type Msg = { role: "user" | "assistant"; content: string };

const SUGGESTIONS = [
  "Tháng này tổng chi phí là bao nhiêu?",
  "Liệt kê 5 nhà cung cấp chi nhiều nhất năm nay",
  "Còn bao nhiêu hóa đơn chưa duyệt?",
  "Công nợ phải trả (TK 331) hiện tại?",
];

function Chat() {
  const askFn = useServerFn(askAccounting);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const send = async (q?: string) => {
    const question = (q ?? input).trim();
    if (!question || loading) return;
    setInput("");
    const next = [...messages, { role: "user" as const, content: question }];
    setMessages(next);
    setLoading(true);
    try {
      const { answer } = await askFn({ data: { question, history: messages } });
      setMessages([...next, { role: "assistant", content: answer }]);
    } catch (e: any) {
      setMessages([...next, { role: "assistant", content: `Lỗi: ${e.message}` }]);
    } finally { setLoading(false); }
  };

  return (
    <div className="flex h-screen flex-col">
      <div className="border-b border-border bg-card px-8 py-4">
        <h1 className="text-xl font-bold tracking-tight">Trợ lý kế toán AI</h1>
        <p className="text-xs text-muted-foreground">Hỏi tự nhiên về dữ liệu kế toán của bạn</p>
      </div>

      <div className="flex-1 overflow-auto p-8">
        {messages.length === 0 ? (
          <div className="mx-auto max-w-2xl">
            <div className="mb-4 text-center text-sm text-muted-foreground">Một số câu hỏi mẫu:</div>
            <div className="grid gap-2 sm:grid-cols-2">
              {SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => send(s)}
                  className="rounded-lg border border-border bg-card p-4 text-left text-sm hover:border-primary hover:bg-accent/5">
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-3xl space-y-4">
            {messages.map((m, i) => (
              <div key={i} className={`flex gap-3 ${m.role === "user" ? "justify-end" : ""}`}>
                {m.role === "assistant" && (
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                    <Sparkles className="h-4 w-4" />
                  </div>
                )}
                <div className={`max-w-[80%] rounded-lg px-4 py-2 text-sm whitespace-pre-wrap ${
                  m.role === "user" ? "bg-primary text-primary-foreground" : "bg-card border border-border"
                }`}>{m.content}</div>
                {m.role === "user" && (
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary">
                    <User className="h-4 w-4" />
                  </div>
                )}
              </div>
            ))}
            {loading && (
              <div className="flex gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <Sparkles className="h-4 w-4 animate-pulse" />
                </div>
                <div className="rounded-lg border border-border bg-card px-4 py-2 text-sm text-muted-foreground">
                  Đang truy vấn dữ liệu...
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="border-t border-border bg-card p-4">
        <div className="mx-auto flex max-w-3xl gap-2">
          <Input
            placeholder="Hỏi gì đó về dữ liệu kế toán..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            disabled={loading}
          />
          <Button onClick={() => send()} disabled={loading || !input.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
