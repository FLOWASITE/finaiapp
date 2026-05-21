import { Sparkles, User } from "lucide-react";
import { ChartBlock, parseChartBlocks } from "@/components/ai/ChartBlock";
import { Markdown } from "@/components/chat/markdown";
import { ToolCalls, type ToolEvent } from "@/components/chat/tool-calls";
import { MessageActions } from "@/components/chat/message-actions";
import { cn } from "@/lib/utils";

export type ChatMsg = {
  id?: string;
  role: "user" | "assistant" | "system";
  content: string;
  toolEvents?: ToolEvent[];
  created_at?: string;
};

const WEEKDAYS_VI = ["Chủ Nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"];

function dayKey(d: Date) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function formatDayLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((today.getTime() - target.getTime()) / 86_400_000);
  if (diffDays === 0) return "Hôm nay";
  if (diffDays === 1) return "Hôm qua";
  if (diffDays > 1 && diffDays < 7) return WEEKDAYS_VI[d.getDay()];
  return d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
}

type Props = {
  messages: ChatMsg[];
  streaming?: boolean;
  onRegenerate?: () => void;
};

export function MessageList({ messages, streaming, onRegenerate }: Props) {
  const lastAssistantIdx = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "assistant") return i;
    }
    return -1;
  })();

  return (
    <div className="mx-auto w-full max-w-3xl space-y-8 px-4 py-8">
      {messages.map((m, i) => {
        if (m.role === "system") return null;
        const isUser = m.role === "user";
        const isLast = i === messages.length - 1;
        const isLastAssistant = i === lastAssistantIdx;

        // Date divider: show when this is the first non-system message of a new day.
        let showDivider = false;
        if (m.created_at) {
          const curKey = dayKey(new Date(m.created_at));
          let prevKey: string | null = null;
          for (let j = i - 1; j >= 0; j--) {
            if (messages[j].role === "system") continue;
            if (messages[j].created_at) {
              prevKey = dayKey(new Date(messages[j].created_at!));
            }
            break;
          }
          if (prevKey !== curKey) showDivider = true;
        }

        return (
          <div key={m.id ?? i} className="space-y-8">
            {showDivider && m.created_at && (
              <div className="flex items-center justify-center pt-2">
                <div className="rounded-full bg-muted/60 px-3 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  {formatDayLabel(m.created_at)}
                </div>
              </div>
            )}
          <div
            className={cn(
              "group flex gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300",
              isUser ? "justify-end" : "items-start",
            )}
          >
            {!isUser && (
              <div
                className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-primary-foreground shadow-md ring-1 ring-white/10"
                style={{ background: "var(--gradient-ai)" }}
              >
                <Sparkles className="h-4 w-4" />
              </div>
            )}
            <div
              className={cn(
                "min-w-0 text-sm leading-relaxed",
                isUser
                  ? "max-w-[78%] whitespace-pre-wrap break-words [overflow-wrap:anywhere] rounded-2xl bg-primary px-5 py-3 text-primary-foreground shadow-lg shadow-primary/15"
                  : "flex-1 text-foreground",
              )}
            >
              {isUser ? (
                m.content
              ) : (
                <>
                  <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
                    Trợ lý
                  </div>
                  {m.toolEvents && m.toolEvents.length > 0 && (
                    <ToolCalls events={m.toolEvents} />
                  )}
                  {m.content ? (
                    <div className="space-y-3">
                      {parseChartBlocks(m.content).map((part, idx) =>
                        part.type === "chart" ? (
                          <ChartBlock key={idx} spec={part.spec} />
                        ) : (
                          <Markdown key={idx}>{part.value}</Markdown>
                        ),
                      )}
                    </div>
                  ) : streaming && isLast ? (
                    <ThinkingIndicator />
                  ) : null}
                  {m.content && !(streaming && isLast) && (
                    <MessageActions
                      content={m.content}
                      canRegenerate={isLastAssistant && !!onRegenerate}
                      onRegenerate={onRegenerate}
                    />
                  )}
                </>
              )}
            </div>
            {isUser && (
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground ring-1 ring-border/60">
                <User className="h-4 w-4" />
              </div>
            )}
          </div>
          </div>
        );
      })}
    </div>
  );
}

function ThinkingIndicator() {
  return (
    <div className="flex items-center gap-1.5 py-1.5" aria-label="Trợ lý đang trả lời">
      <span className="chat-dot" style={{ animationDelay: "0ms" }} />
      <span className="chat-dot" style={{ animationDelay: "160ms" }} />
      <span className="chat-dot" style={{ animationDelay: "320ms" }} />
    </div>
  );
}
