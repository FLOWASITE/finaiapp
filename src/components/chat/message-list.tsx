import { Sparkles, User, FileText, Image as ImageIcon, Copy, Check, Pencil, RefreshCw } from "lucide-react";
import { FinMascot } from "@/components/fin-mascot";

import { useState } from "react";
import { toast } from "sonner";
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
  if (items.length >= 6) {
    const shown = items.slice(0, 9);
    return (
      <div>
        <div className="mb-1 text-[11px] font-medium opacity-80">
          {items.length} file đính kèm
        </div>
        <div className="grid grid-cols-5 gap-1 sm:grid-cols-9">
          {shown.map((a, idx) => {
            const isImg = a.mime?.startsWith("image/");
            return (
              <div
                key={`${a.name}-${idx}`}
                title={a.name}
                className="flex aspect-square flex-col items-center justify-center gap-0.5 rounded-md bg-primary-foreground/15 px-1 text-primary-foreground"
              >
                {isImg ? <ImageIcon className="h-3.5 w-3.5" /> : <FileText className="h-3.5 w-3.5" />}
                <span className="w-full truncate text-center text-[9px] leading-none opacity-90">
                  {(a.mime?.split("/")[1] || "file").toUpperCase()}
                </span>
              </div>
            );
          })}
          {items.length > 9 && (
            <div className="flex aspect-square items-center justify-center rounded-md border border-dashed border-primary-foreground/30 text-[10px] font-semibold">
              +{items.length - 9}
            </div>
          )}
        </div>
      </div>
    );
  }
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
    <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6">
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
          <div key={m.id ?? i} className="space-y-6">
            {showDivider && m.created_at && (
              <div className="flex items-center justify-center py-2">
                <div className="flex items-center gap-3">
                  <span className="h-px w-12 bg-slate-200" />
                  <span className="rounded-full border border-slate-200 bg-white/70 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500 backdrop-blur-sm">
                    {formatDayLabel(m.created_at)}
                  </span>
                  <span className="h-px w-12 bg-slate-200" />
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
              <div className="mt-0.5">
                <FinMascot
                  size="xs"
                  mood={streaming && isLast ? "thinking" : "idle"}
                />
              </div>
            )}

            {isUser ? (
              <div className="flex min-w-0 max-w-[78%] flex-col items-end">
                <div
                  className="min-w-0 whitespace-pre-wrap break-words [overflow-wrap:anywhere] rounded-3xl px-5 py-3 text-sm leading-relaxed text-white shadow-lg shadow-blue-500/20 ring-1 ring-white/10"
                  style={{ background: "var(--gradient-ai)" }}
                >
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
                </div>
                <UserMessageActions content={m.content} createdAt={m.created_at} />
              </div>
            ) : (
              <div className="min-w-0 flex-1 text-sm leading-relaxed text-slate-800">
                <div className="mb-1.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                  Fin
                  <span className="h-1 w-1 rounded-full bg-slate-300" />
                  <span className="font-medium normal-case tracking-normal text-slate-400">
                    AI Agent Kế toán
                  </span>

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
              </div>
            )}
            {isUser && (
              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-slate-500 ring-1 ring-slate-200 shadow-sm">
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

function UserMessageActions({ content, createdAt }: { content: string; createdAt?: string }) {
  const [copied, setCopied] = useState(false);

  const time = createdAt
    ? new Date(createdAt).toLocaleTimeString("vi-VN", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  const copy = async () => {
    if (!content) return;
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      toast.success("Đã sao chép");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Không sao chép được");
    }
  };

  const edit = () => {
    if (!content) return;
    window.dispatchEvent(
      new CustomEvent("chat:edit-user-msg", { detail: { content } }),
    );
  };

  const resend = () => {
    if (!content) return;
    window.dispatchEvent(
      new CustomEvent("chat:resend-user-msg", { detail: { content } }),
    );
  };

  return (
    <div className="mt-1.5 flex items-center gap-1 text-slate-400 opacity-0 transition-opacity duration-200 group-hover:opacity-100 focus-within:opacity-100">
      {time && <span className="px-1 text-[11px] tabular-nums">{time}</span>}
      <ActionMini onClick={resend} title="Gửi lại">
        <RefreshCw className="h-3.5 w-3.5" />
      </ActionMini>
      <ActionMini onClick={edit} title="Sửa và gửi lại">
        <Pencil className="h-3.5 w-3.5" />
      </ActionMini>
      <ActionMini onClick={copy} title={copied ? "Đã sao chép" : "Sao chép"}>
        {copied ? (
          <Check className="h-3.5 w-3.5 text-emerald-500" />
        ) : (
          <Copy className="h-3.5 w-3.5" />
        )}
      </ActionMini>
    </div>
  );
}

function ActionMini({
  children,
  onClick,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className="inline-flex h-6 w-6 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
    >
      {children}
    </button>
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
  type Pair = { call?: any; result?: any; progress: any[] };
  const map = new Map<string, Pair>();
  const order: string[] = [];
  for (const ev of events) {
    const id = (ev as any).toolCallId as string;
    if (!map.has(id)) {
      map.set(id, { progress: [] });
      order.push(id);
    }
    const slot = map.get(id)!;
    if (ev.type === "tool-call") slot.call = ev;
    else if ((ev as any).type === "tool-progress") slot.progress.push((ev as any).phase);
    else slot.result = ev;
  }

  // If this message contains a bulkIntake event, hide the (otherwise
  // duplicate) individual parseDocument cards.
  const hasBulkIntake = order.some((id) => {
    const tn = map.get(id)?.call?.toolName ?? map.get(id)?.result?.output?.toolName;
    return tn === "bulkIntake";
  });

  // Build a set of proposeAction ids that should be consumed (rendered inline
  // inside a paired InvoiceExtractCard) instead of rendered as standalone cards.
  const consumedProposalIds = new Set<string>();
  for (let i = 0; i < order.length; i++) {
    const id = order[i];
    const { call, result } = map.get(id)!;
    const tn = (call?.toolName ?? result?.output?.toolName) as string | undefined;
    if (tn !== "parseDocument") continue;
    if (!result?.output?.parsed) continue;
    // find next proposeAction
    for (let j = i + 1; j < order.length; j++) {
      const nid = order[j];
      const np = map.get(nid)!;
      const ntn = (np.call?.toolName ?? np.result?.output?.toolName) as string | undefined;
      if (ntn === "proposeAction") {
        const innerTool = np.call?.input?.tool_name as string | undefined;
        const aid = np.result?.output?.action_id as string | undefined;
        if (innerTool && aid) {
          consumedProposalIds.add(nid);
        }
        break;
      }
    }
  }

  const out: React.ReactNode[] = [];
  for (let i = 0; i < order.length; i++) {
    const id = order[i];
    const { call, result, progress } = map.get(id)!;
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
          // Look ahead for a paired proposeAction to embed inside the card.
          let proposal: { actionId: string; toolName: string; input: any; summary?: string } | null = null;
          for (let j = i + 1; j < order.length; j++) {
            const np = map.get(order[j])!;
            const ntn = (np.call?.toolName ?? np.result?.output?.toolName) as string | undefined;
            if (ntn === "proposeAction") {
              const innerTool = np.call?.input?.tool_name as string | undefined;
              const innerInput = np.call?.input?.input ?? {};
              const aid = np.result?.output?.action_id as string | undefined;
              const summary = np.result?.output?.summary as string | undefined;
              if (aid && innerTool) {
                proposal = { actionId: aid, toolName: innerTool, input: innerInput, summary };
              }
              break;
            }
          }
          out.push(
            <InvoiceExtractCard
              key={id + "-ext"}
              parsed={out_.parsed}
              uploadId={out_.uploadId}
              filename={filename}
              kind={out_.kind}
              proposal={proposal}
            />,
          );
        }
      } else {
        out.push(
          <ParseProgressCard
            key={id + "-prog"}
            streaming={streaming}
            filename={filename}
            livePhases={progress}
          />,
        );
      }
      continue;
    }

    if (toolName === "proposeAction") {
      if (consumedProposalIds.has(id)) continue;
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
