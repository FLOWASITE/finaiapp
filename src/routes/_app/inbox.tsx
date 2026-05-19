import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Inbox as InboxIcon,
  ClipboardCheck,
  AlertTriangle,
  Landmark,
  Calendar,
  Sparkles,
  ArrowRight,
  Plus,
  Banknote,
  Receipt,
} from "lucide-react";
import { openAskAi } from "@/components/ai/AskAiSheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/inbox")({
  component: InboxPage,
  head: () => ({
    meta: [{ title: "Hộp việc · FinAI" }],
  }),
});

type Lane = {
  key: string;
  icon: React.ElementType;
  title: string;
  caption: string;
  to: string;
  accent: string;
};

const LANES: Lane[] = [
  {
    key: "approve",
    icon: ClipboardCheck,
    title: "Cần duyệt",
    caption: "Nháp do AI tạo từ hoá đơn, sao kê",
    to: "/documents",
    accent: "from-emerald-500/15 to-emerald-500/5 ring-emerald-500/25",
  },
  {
    key: "overdue",
    icon: AlertTriangle,
    title: "Quá hạn",
    caption: "Phải thu / phải trả đã đến hạn",
    to: "/receivables",
    accent: "from-rose-500/15 to-rose-500/5 ring-rose-500/25",
  },
  {
    key: "reconcile",
    icon: Landmark,
    title: "Chưa đối soát",
    caption: "Giao dịch ngân hàng chờ ghép",
    to: "/bank/reconcile",
    accent: "from-sky-500/15 to-sky-500/5 ring-sky-500/25",
  },
  {
    key: "deadline",
    icon: Calendar,
    title: "Sắp đến hạn",
    caption: "Thuế, lương, công nợ trong 7 ngày",
    to: "/tax/gtgt",
    accent: "from-amber-500/15 to-amber-500/5 ring-amber-500/25",
  },
  {
    key: "anomaly",
    icon: Sparkles,
    title: "Bất thường",
    caption: "AI phát hiện điểm cần xem",
    to: "/chat",
    accent: "from-violet-500/15 to-violet-500/5 ring-violet-500/25",
  },
];

const AI_PROMPTS = [
  "Tháng này lãi bao nhiêu?",
  "Ai nợ tôi quá 30 ngày?",
  "So sánh chi phí tháng này với tháng trước",
  "Hàng tồn kho nào sắp hết?",
];

const QUICK_ACTIONS = [
  { label: "Thu tiền", intent: "Tạo phiếu thu: ", icon: Banknote },
  { label: "Chi tiền", intent: "Tạo phiếu chi: ", icon: Banknote },
  { label: "Bán hàng", intent: "Tạo hoá đơn bán cho: ", icon: Receipt },
  { label: "Mua hàng", intent: "Ghi nhận hoá đơn mua từ: ", icon: Receipt },
];

function InboxPage() {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 lg:py-10">
      {/* Header */}
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
            <InboxIcon className="h-3.5 w-3.5" /> Hộp việc
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
            Hôm nay bạn cần làm gì?
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Mọi việc cần xử lý gom lại một chỗ. Gõ <kbd className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono">⌘K</kbd> để ra lệnh hoặc <kbd className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono">⌘J</kbd> để mở trợ lý.
          </p>
        </div>
        <Button onClick={() => openAskAi()} className="gap-2">
          <Plus className="h-4 w-4" /> Thêm nghiệp vụ
        </Button>
      </div>

      {/* Lanes */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {LANES.map((lane) => {
          const Icon = lane.icon;
          return (
            <Link
              key={lane.key}
              to={lane.to}
              className={cn(
                "group relative flex flex-col gap-3 rounded-2xl border border-border/40 bg-gradient-to-br p-4 ring-1 ring-inset transition-all hover:-translate-y-0.5 hover:border-border/70 hover:shadow-lg",
                lane.accent,
              )}
            >
              <div className="flex items-center justify-between">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-background/60 ring-1 ring-border/40">
                  <Icon className="h-4 w-4 text-foreground/80" />
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
              </div>
              <div>
                <div className="text-sm font-semibold text-foreground">{lane.title}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">{lane.caption}</div>
              </div>
              <div className="mt-auto text-[11px] text-muted-foreground/70">
                Mở chi tiết →
              </div>
            </Link>
          );
        })}
      </div>

      {/* Quick actions + AI */}
      <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-border/40 bg-card/40 p-5 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Tạo nhanh</div>
              <div className="text-sm font-semibold text-foreground">Mẫu nghiệp vụ thường dùng</div>
            </div>
            <button
              type="button"
              onClick={() => openAskAi()}
              className="text-xs font-medium text-primary hover:underline"
            >
              Mở trợ lý AI →
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {QUICK_ACTIONS.map((a) => {
              const Icon = a.icon;
              return (
                <button
                  key={a.label}
                  type="button"
                  onClick={() => openAskAi(a.intent)}
                  className="group flex flex-col items-start gap-2 rounded-xl border border-border/40 bg-background/40 p-3 text-left transition-all hover:border-primary/40 hover:bg-primary/5"
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="text-sm font-medium">{a.label}</div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="rounded-2xl border border-border/40 bg-card/40 p-5">
          <div className="mb-3 flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5" /> Hỏi AI
          </div>
          <div className="flex flex-col gap-1.5">
            {AI_PROMPTS.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => openAskAi(q)}
                className="rounded-lg border border-border/30 bg-background/30 px-3 py-2 text-left text-xs text-foreground/80 transition-all hover:border-primary/40 hover:bg-primary/5"
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
