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
};

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
        return (
          <div
            key={m.id ?? i}
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
