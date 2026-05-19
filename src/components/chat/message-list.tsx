import { Sparkles, User } from "lucide-react";
import { ChartBlock, parseChartBlocks } from "@/components/ai/ChartBlock";
import { cn } from "@/lib/utils";

export type ChatMsg = {
  id?: string;
  role: "user" | "assistant" | "system";
  content: string;
};

type Props = {
  messages: ChatMsg[];
  streaming?: boolean;
};

/**
 * ChatGPT-style transcript:
 *  - Assistant: no bubble background, plain text on the surface
 *  - User: high-contrast primary bubble, right aligned
 */
export function MessageList({ messages, streaming }: Props) {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6">
      {messages.map((m, i) => {
        if (m.role === "system") return null;
        const isUser = m.role === "user";
        const isLast = i === messages.length - 1;
        return (
          <div
            key={m.id ?? i}
            className={cn("flex gap-3", isUser ? "justify-end" : "items-start")}
          >
            {!isUser && (
              <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Sparkles className="h-3.5 w-3.5" />
              </div>
            )}
            <div
              className={cn(
                "min-w-0 text-sm leading-relaxed",
                isUser
                  ? "max-w-[78%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-primary-foreground shadow-md shadow-primary/20"
                  : "flex-1 text-foreground",
              )}
            >
              {isUser ? (
                m.content
              ) : m.content ? (
                <div className="space-y-3">
                  {parseChartBlocks(m.content).map((part, idx) =>
                    part.type === "chart" ? (
                      <ChartBlock key={idx} spec={part.spec} />
                    ) : (
                      <div key={idx} className="whitespace-pre-wrap">{part.value}</div>
                    ),
                  )}
                </div>
              ) : streaming && isLast ? (
                <ThinkingDots />
              ) : null}
            </div>
            {isUser && (
              <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
                <User className="h-3.5 w-3.5" />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ThinkingDots() {
  return (
    <span className="inline-flex items-center gap-1 text-muted-foreground">
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.3s]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.15s]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current" />
      <span className="ml-2 text-xs">Đang truy vấn dữ liệu…</span>
    </span>
  );
}
