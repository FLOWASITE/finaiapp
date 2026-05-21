import { Sparkles, User, FileText, Image as ImageIcon } from "lucide-react";
import { ChartBlock, parseChartBlocks } from "@/components/ai/ChartBlock";
import { Markdown } from "@/components/chat/markdown";
import { ToolCalls, type ToolEvent } from "@/components/chat/tool-calls";
import { MessageActions } from "@/components/chat/message-actions";
import { ParseProgressCard } from "@/components/chat/invoice/parse-progress-card";
import { InvoiceExtractCard } from "@/components/chat/invoice/invoice-extract-card";
import { JournalProposalCard } from "@/components/chat/invoice/journal-proposal-card";
import { BulkIntakeCard } from "@/components/chat/bulk/bulk-intake-card";
import { BulkRunCard } from "@/components/chat/bulk/bulk-run-card";
import type { BulkPlan, BulkRunUpdate } from "@/components/chat/bulk/types";
import { cn } from "@/lib/utils";

export type ChatAttachmentMeta = {
  name: string;
  mime: string;
  size?: number;
  kind?: string;
};

export type ChatMsg = {
  id?: string;
  role: "user" | "assistant" | "system";
  content: string;
  toolEvents?: ToolEvent[];
  created_at?: string;
  attachments?: ChatAttachmentMeta[];
};

function formatSize(n?: number) {
  if (n == null) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function AttachmentChips({ items }: { items: ChatAttachmentMeta[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((a, idx) => {
        const isImg = a.mime?.startsWith("image/");
        return (
          <div
            key={`${a.name}-${idx}`}
            className="flex max-w-[220px] items-center gap-2 rounded-xl border border-primary-foreground/20 bg-primary-foreground/10 px-2 py-1.5"
          >
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary-foreground/15">
              {isImg ? <ImageIcon className="h-3.5 w-3.5" /> : <FileText className="h-3.5 w-3.5" />}
            </div>
            <div className="min-w-0">
              <div className="truncate text-[11px] font-medium">{a.name}</div>
              <div className="truncate text-[10px] uppercase opacity-70">
                {(a.mime?.split("/")[1] || "file").toUpperCase()}
                {a.size != null ? ` · ${formatSize(a.size)}` : ""}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}


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
                <div className="space-y-2">
                  {m.attachments && m.attachments.length > 0 && (
                    <AttachmentChips items={m.attachments} />
                  )}
                  {m.content ? (
                    <div>{m.content}</div>
                  ) : m.attachments && m.attachments.length > 0 ? (
                    <div className="text-[11px] italic opacity-70">(đã đính kèm)</div>
                  ) : null}
                </div>
              ) : (
                <>
                  <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
                    Trợ lý
                  </div>
                  {m.toolEvents && m.toolEvents.length > 0 && (
                    <div className="mb-3 space-y-3">
                      <InvoiceToolEvents events={m.toolEvents} streaming={!!streaming && isLast} />
                      <ToolCalls
                        events={m.toolEvents.filter(
                          (ev) =>
                            !(
                              (ev as any).toolName === "parseDocument" ||
                              (ev as any).toolName === "proposeAction"
                            ),
                        )}
                      />
                    </div>
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

/**
 * Render specialized cards for parseDocument + proposeAction tool events
 * inside an assistant message. Generic tools are rendered separately by
 * <ToolCalls> in the parent.
 */
function InvoiceToolEvents({
  events,
  streaming,
}: {
  events: ToolEvent[];
  streaming: boolean;
}) {
  // Group by toolCallId so we know if a parseDocument call is still in-flight.
  type Pair = { call?: any; result?: any };
  const map = new Map<string, Pair>();
  const order: string[] = [];
  for (const ev of events) {
    const id = (ev as any).toolCallId as string;
    if (!map.has(id)) {
      map.set(id, {});
      order.push(id);
    }
    const slot = map.get(id)!;
    if (ev.type === "tool-call") slot.call = ev;
    else slot.result = ev;
  }

  // If this message contains a bulkIntake event, hide the (otherwise
  // duplicate) individual parseDocument cards.
  const hasBulkIntake = order.some((id) => {
    const tn = map.get(id)?.call?.toolName ?? map.get(id)?.result?.output?.toolName;
    return tn === "bulkIntake";
  });

  const out: React.ReactNode[] = [];
  for (const id of order) {
    const { call, result } = map.get(id)!;
    const toolName = (call?.toolName ?? result?.output?.toolName) as string | undefined;

    if (toolName === "bulkIntake") {
      const plan = result?.output as BulkPlan | undefined;
      if (!plan || (plan as any).error) {
        out.push(
          <div
            key={id + "-bulk-loading"}
            className="rounded-xl border border-border/60 bg-card/40 p-3 text-sm text-muted-foreground"
          >
            Đang phân loại {call?.input?.fileCount ?? ""} file…
          </div>,
        );
        continue;
      }
      out.push(
        <BulkIntakeCard
          key={id + "-bulk-plan"}
          plan={plan}
          running={streaming}
          onRun={() => {
            window.dispatchEvent(
              new CustomEvent("chat:run-bulk-plan", {
                detail: {
                  items: plan.items.map((it) => ({
                    id: it.id,
                    filename: it.filename,
                    uploadId: it.uploadId,
                    kind: it.kind,
                    bucket: it.bucket,
                  })),
                },
              }),
            );
          }}
        />,
      );
      continue;
    }

    if (toolName === "bulkRun") {
      const update = (result?.output ?? {
        total: call?.input?.total ?? 0,
        done: 0,
        posted: 0,
        failed: 0,
        recent: [],
        etaSec: null,
      }) as BulkRunUpdate;
      out.push(<BulkRunCard key={id + "-bulk-run"} update={update} />);
      continue;
    }

    if (toolName === "parseDocument") {
      if (hasBulkIntake) continue;
      const filename = call?.input?.filename ?? result?.output?.filename;
      if (result) {
        const out_ = result.output ?? {};
        if (out_?.error) {
          out.push(
            <div
              key={id + "-err"}
              className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
            >
              Không đọc được {filename ?? "tệp"}: {out_.error}
            </div>,
          );
          continue;
        }
        out.push(
          <ParseProgressCard
            key={id + "-prog"}
            phases={out_.phases}
            filename={filename}
            streaming={false}
          />,
        );
        if (out_.parsed) {
          out.push(
            <InvoiceExtractCard
              key={id + "-ext"}
              parsed={out_.parsed}
              uploadId={out_.uploadId}
              filename={filename}
              kind={out_.kind}
            />,
          );
        }
      } else {
        out.push(
          <ParseProgressCard
            key={id + "-prog"}
            streaming={streaming}
            filename={filename}
          />,
        );
      }
      continue;
    }

    if (toolName === "proposeAction") {
      const input = call?.input ?? {};
      const innerTool = input?.tool_name as string | undefined;
      const innerInput = input?.input ?? {};
      const r = result?.output ?? {};
      const actionId = r?.action_id as string | undefined;
      const summary = r?.summary as string | undefined;
      if (actionId && innerTool) {
        out.push(
          <JournalProposalCard
            key={id + "-prop"}
            actionId={actionId}
            toolName={innerTool}
            input={innerInput}
            summary={summary}
          />,
        );
      }
      continue;
    }
  }

  if (out.length === 0) return null;
  return <>{out}</>;
}
