import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Sparkles, Database, Users, FileCheck, Receipt } from "lucide-react";
import { Composer } from "@/components/chat/composer";
import { createThread, appendMessage } from "@/lib/chat-threads.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/chat/")({
  component: ChatIndex,
});

const SUGGESTIONS: Array<{ icon: any; label: string; text: string }> = [
  {
    icon: Database,
    label: "Tổng chi phí",
    text: "Tháng này tổng chi phí là bao nhiêu?",
    tone: "teal" as const,
  },
  {
    icon: Users,
    label: "Top nhà cung cấp",
    text: "Liệt kê 5 nhà cung cấp chi nhiều nhất năm nay",
  },
  {
    icon: FileCheck,
    label: "Hoá đơn chờ duyệt",
    text: "Còn bao nhiêu hóa đơn chưa duyệt?",
  },
  {
    icon: Receipt,
    label: "Công nợ phải trả",
    text: "Công nợ phải trả (TK 331) hiện tại?",
  },
];

function ChatIndex() {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const createFn = useServerFn(createThread);
  const appendFn = useServerFn(appendMessage);
  const qc = useQueryClient();

  const start = async (text: string) => {
    const q = text.trim();
    if (!q || loading) return;
    setLoading(true);
    try {
      const t = await createFn({ data: { title: q.slice(0, 60) } });
      await appendFn({ data: { threadId: t.id, role: "user", content: q } });
      qc.invalidateQueries({ queryKey: ["chat", "threads"] });
      navigate({
        to: "/chat/$threadId",
        params: { threadId: t.id },
        search: { autostart: "1" },
      });
    } catch (e: any) {
      toast.error(e?.message || "Không tạo được cuộc trò chuyện");
      setLoading(false);
    }
  };

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto px-4 py-8">
        <div className="mx-auto w-full max-w-3xl text-center">
          <div className="mb-6 flex justify-center">
            <div className="relative">
              <div
                className="absolute inset-0 -z-10 rounded-3xl blur-2xl opacity-60"
                style={{ background: "var(--gradient-ai)" }}
              />
              <div
                className="flex h-16 w-16 items-center justify-center rounded-3xl text-primary-foreground shadow-xl ring-1 ring-white/10"
                style={{ background: "var(--gradient-ai)" }}
              >
                <Sparkles className="h-8 w-8" />
              </div>
            </div>
          </div>
          <h1 className="mb-3 text-3xl font-semibold tracking-tight">Trợ lý kế toán AI</h1>
          <p className="mb-10 text-sm leading-relaxed text-muted-foreground">
            Hỏi tự nhiên về dữ liệu kế toán của bạn —
            <br />
            câu trả lời được stream theo thời gian thực, kèm biểu đồ và đề xuất hành động.
          </p>
          <div className="grid gap-3 2xl:grid-cols-2">
            {SUGGESTIONS.map((s) => {
              const Icon = s.icon;
              return (
                <button
                  key={s.text}
                  onClick={() => start(s.text)}
                  disabled={loading}
                  className="group flex min-w-0 items-start gap-3 rounded-2xl border border-border/50 bg-card/40 p-4 text-left transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:bg-card/80 hover:shadow-lg hover:shadow-primary/5 disabled:opacity-50 disabled:hover:translate-y-0"
                >
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary/15">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-semibold text-foreground">{s.label}</span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground break-words [overflow-wrap:anywhere]">{s.text}</span>
                  </span>
                </button>
              );
            })}
          </div>
          <p className="mt-8 text-xs text-muted-foreground/60">
            Hoặc nhập câu hỏi bên dưới để bắt đầu
          </p>
        </div>
      </div>
      <div className="relative px-4 pb-6 pt-4">
        <div className="pointer-events-none absolute inset-x-0 -top-6 h-6 chat-footer-fade" />
        <div className="mx-auto max-w-3xl">
          <Composer
            value={input}
            onChange={setInput}
            onSubmit={() => {
              const v = input.trim();
              if (!v) return;
              setInput("");
              start(v);
            }}
            autoFocus
            loading={loading}
            placeholder="Hỏi gì đó để bắt đầu cuộc trò chuyện…"
          />
        </div>
      </div>
    </div>
  );
}
