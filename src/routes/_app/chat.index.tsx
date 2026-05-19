import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Sparkles } from "lucide-react";
import { Composer } from "@/components/chat/composer";
import { createThread, appendMessage } from "@/lib/chat-threads.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/chat/")({
  component: ChatIndex,
});

const SUGGESTIONS = [
  "Tháng này tổng chi phí là bao nhiêu?",
  "Liệt kê 5 nhà cung cấp chi nhiều nhất năm nay",
  "Còn bao nhiêu hóa đơn chưa duyệt?",
  "Công nợ phải trả (TK 331) hiện tại?",
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
    <div className="flex flex-1 flex-col">
      <div className="flex flex-1 items-center justify-center px-4">
        <div className="mx-auto w-full max-w-2xl text-center">
          <div className="mb-4 flex justify-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Sparkles className="h-7 w-7" />
            </div>
          </div>
          <h1 className="mb-2 text-2xl font-semibold tracking-tight">Trợ lý kế toán AI</h1>
          <p className="mb-8 text-sm text-muted-foreground">
            Hỏi tự nhiên về dữ liệu kế toán của bạn — câu trả lời stream theo thời gian thực.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => start(s)}
                disabled={loading}
                className="rounded-xl border border-white/10 bg-card/50 p-3 text-left text-sm transition hover:border-primary/40 hover:bg-card disabled:opacity-50"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="border-t border-white/5 bg-background/50 px-4 py-3">
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
