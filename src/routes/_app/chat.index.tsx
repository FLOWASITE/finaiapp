import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Sparkles, Database, Users, FileCheck, Receipt } from "lucide-react";
import { FinMascot } from "@/components/fin-mascot";

import { Composer } from "@/components/chat/composer";
import { createThread, appendMessage } from "@/lib/chat-threads.functions";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/chat/")({
  component: ChatIndex,
});

type Tone = "teal" | "blue";

const SUGGESTIONS: Array<{ icon: any; label: string; text: string; tone: Tone }> = [
  {
    icon: Database,
    label: "Tổng chi phí",
    text: "Tháng này tổng chi phí là bao nhiêu?",
    tone: "teal",
  },
  {
    icon: Users,
    label: "Top nhà cung cấp",
    text: "Liệt kê 5 nhà cung cấp chi nhiều nhất năm nay",
    tone: "blue",
  },
  {
    icon: FileCheck,
    label: "Hoá đơn chờ duyệt",
    text: "Còn bao nhiêu hóa đơn chưa duyệt?",
    tone: "blue",
  },
  {
    icon: Receipt,
    label: "Công nợ phải trả",
    text: "Công nợ phải trả (TK 331) hiện tại?",
    tone: "teal",
  },
];

const TONE_STYLES: Record<
  Tone,
  { bucket: string; bucketHover: string; cardHover: string }
> = {
  teal: {
    bucket: "bg-teal-50 text-teal-600",
    bucketHover: "group-hover:bg-teal-500 group-hover:text-white",
    cardHover: "hover:border-teal-400 hover:shadow-xl hover:shadow-teal-400/10",
  },
  blue: {
    bucket: "bg-blue-50 text-blue-600",
    bucketHover: "group-hover:bg-blue-500 group-hover:text-white",
    cardHover: "hover:border-blue-400 hover:shadow-xl hover:shadow-blue-400/10",
  },
};

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
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto px-4 py-4 md:px-6 md:py-10">
        <div className="mx-auto w-full max-w-3xl text-center">
          {/* Brand identity */}
          <div className="mb-4 flex justify-center md:mb-6">
            <span className="md:hidden">
              <FinMascot size="xl" mood="happy" />
            </span>
            <span className="hidden md:inline-flex">
              <FinMascot size="2xl" mood="happy" />
            </span>
          </div>

          <p className="mx-auto mb-2 max-w-lg text-base font-medium text-slate-600 md:text-lg">
            Chào, mình là <span className="font-semibold text-slate-900">Fin</span> — hỏi mình về sổ sách nhé.
          </p>

          <p className="mx-auto mb-6 hidden max-w-lg text-base leading-relaxed text-slate-500 md:mb-10 md:block">
            Hỏi tự nhiên về dữ liệu kế toán của bạn — câu trả lời được stream theo thời gian thực, kèm biểu đồ và đề xuất hành động.
          </p>

          {/* Suggestion grid */}
          <div className="mb-6 grid w-full grid-cols-1 gap-2 md:mb-10 md:grid-cols-2 md:gap-4">
            {SUGGESTIONS.map((s) => {
              const Icon = s.icon;
              const tone = TONE_STYLES[s.tone];
              return (
                <button
                  key={s.text}
                  onClick={() => start(s.text)}
                  disabled={loading}
                  className={cn(
                    "group flex items-start gap-3 rounded-2xl border border-slate-200 bg-white/60 p-3 text-left backdrop-blur-sm transition-all duration-300 disabled:opacity-50 md:p-5",
                    tone.cardHover,
                  )}
                >
                  <span
                    className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors md:h-11 md:w-11",
                      tone.bucket,
                      tone.bucketHover,
                    )}
                  >
                    <Icon className="h-4 w-4 md:h-5 md:w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="mb-0.5 block text-sm font-semibold text-slate-900 md:mb-1 md:text-base">
                      {s.label}
                    </span>
                    <span className="block text-xs leading-snug text-slate-500 break-words [overflow-wrap:anywhere] line-clamp-1 md:line-clamp-none md:text-sm">
                      {s.text}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          <p className="hidden text-xs font-medium uppercase tracking-widest text-slate-400 md:block">
            Hoặc nhập câu hỏi bên dưới để bắt đầu
          </p>
        </div>
      </div>
      <div className="relative px-4 pb-6 pt-4">
        <div className="pointer-events-none absolute inset-x-0 -top-6 h-6 chat-footer-fade" />
        <div className="mx-auto max-w-2xl">
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
