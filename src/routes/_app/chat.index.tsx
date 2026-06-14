import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Database,
  Users,
  FileCheck,
  Receipt,
  Mail,
  BookOpen,
  Calculator,
} from "lucide-react";
import { FinMascot } from "@/components/fin-mascot";

import { Composer } from "@/components/chat/composer";
import { ChatHeader } from "@/components/chat/chat-header";
import { useChatMode } from "@/hooks/use-chat-mode";
import { createThread, appendMessage } from "@/lib/chat-threads.functions";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/chat/")({
  component: ChatIndex,
});

type Tone = "teal" | "blue";

const ACCOUNTING_SUGGESTIONS: Array<{ icon: any; label: string; text: string; tone: Tone }> = [
  { icon: Database, label: "Chi phí tháng", text: "Tổng chi phí tháng này là bao nhiêu?", tone: "teal" },
  { icon: Users, label: "Top NCC", text: "Top 5 nhà cung cấp chi nhiều nhất năm nay", tone: "blue" },
  { icon: FileCheck, label: "Hoá đơn chờ duyệt", text: "Còn bao nhiêu hoá đơn đầu vào chưa duyệt?", tone: "blue" },
  { icon: Receipt, label: "Công nợ phải trả", text: "Số dư TK 331 theo nhà cung cấp", tone: "teal" },
];

const AI_SUGGESTIONS: Array<{ icon: any; label: string; text: string; tone: Tone }> = [
  { icon: BookOpen, label: "Tra cứu chính sách", text: "Giải thích ngắn gọn Nghị định 123/2020 về hoá đơn điện tử", tone: "teal" },
  { icon: Calculator, label: "Định khoản", text: "Mua văn phòng phẩm 2.000.000đ trả tiền mặt thì hạch toán thế nào?", tone: "blue" },
  { icon: Mail, label: "Soạn công văn", text: "Soạn email nhắc công nợ quá hạn cho khách hàng, giọng lịch sự", tone: "blue" },
  { icon: FileCheck, label: "Kiểm tra hoá đơn", text: "Checklist kiểm tra tính hợp lệ của hoá đơn GTGT đầu vào", tone: "teal" },
];

const TONE_STYLES: Record<Tone, { bucket: string; bucketHover: string; cardHover: string }> = {
  teal: {
    bucket: "bg-teal-50 text-teal-600",
    bucketHover: "group-hover:bg-teal-500 group-hover:text-white",
    cardHover: "hover:border-teal-400",
  },
  blue: {
    bucket: "bg-blue-50 text-blue-600",
    bucketHover: "group-hover:bg-blue-500 group-hover:text-white",
    cardHover: "hover:border-blue-400",
  },
};

function ChatIndex() {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode] = useChatMode();
  const navigate = useNavigate();
  const createFn = useServerFn(createThread);
  const appendFn = useServerFn(appendMessage);
  const qc = useQueryClient();

  const isAi = mode === "ai";
  const SUGGESTIONS = isAi ? AI_SUGGESTIONS : ACCOUNTING_SUGGESTIONS;

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
      <ChatHeader title="Fin" />

      <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto px-4 py-4 md:px-6 md:py-8">
        <div className="mx-auto w-full max-w-3xl text-center">
          <div className="mb-3 flex justify-center md:mb-4">
            <span className="md:hidden">
              <FinMascot size="xl" mood="happy" />
            </span>
            <span className="hidden md:inline-flex">
              <FinMascot size="xl" mood="happy" />
            </span>
          </div>

          <p className="mx-auto mb-2 max-w-lg text-base font-medium text-slate-600 md:text-lg">
            {isAi ? (
              <>Chào, mình là <span className="font-semibold text-slate-900">Fin</span> — hỏi mình bất cứ điều gì.</>
            ) : (
              <>Chào, mình là <span className="font-semibold text-slate-900">Fin</span> — hỏi mình về sổ sách nhé.</>
            )}
          </p>

          <p className="mx-auto mb-4 hidden max-w-lg text-sm leading-relaxed text-slate-500 md:mb-6 md:block">
            {isAi
              ? "Chế độ AI — trò chuyện tự do với mô hình ngôn ngữ, không truy cập dữ liệu doanh nghiệp."
              : "Hỏi tự nhiên về dữ liệu kế toán của bạn — câu trả lời được stream theo thời gian thực, kèm biểu đồ và đề xuất hành động."}
          </p>

          <div className="mb-4 grid w-full grid-cols-1 gap-2 md:mb-6 md:grid-cols-2 md:gap-2.5">
            {SUGGESTIONS.map((s) => {
              const Icon = s.icon;
              const tone = TONE_STYLES[s.tone];
              return (
                <button
                  key={s.text}
                  onClick={() => start(s.text)}
                  disabled={loading}
                  className={cn(
                    "group flex items-start gap-2 rounded-lg border border-slate-200 bg-white/60 p-2 text-left backdrop-blur-sm transition-colors duration-200 disabled:opacity-50 md:p-2.5",
                    tone.cardHover,
                  )}
                >
                  <span
                    className={cn(
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors md:h-8 md:w-8",
                      tone.bucket,
                      tone.bucketHover,
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-semibold text-slate-900 md:text-[13px]">
                      {s.label}
                    </span>
                    <span className="block text-[11px] leading-tight text-slate-500 break-words [overflow-wrap:anywhere] line-clamp-1">
                      {s.text}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <div className="relative px-4 pb-6 pt-4">
        <div className="pointer-events-none absolute inset-x-0 -top-16 h-16 chat-footer-fade" />
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
            placeholder={isAi ? "Hỏi AI bất cứ điều gì…" : "Hỏi gì đó để bắt đầu cuộc trò chuyện…"}
          />
          <p className="mt-3 text-center text-[10px] text-muted-foreground/60">
            Fin có thể mắc sai sót. Vui lòng kiểm tra số liệu quan trọng.
          </p>
        </div>
      </div>
    </div>
  );
}
