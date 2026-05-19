import { useEffect, useMemo, useRef, useState } from "react";
import {
  Sparkles,
  CheckCircle2,
  Pencil,
  X,
  Loader2,
  Send,
  Mic,
  Paperclip,
  Link2,
} from "lucide-react";
import type { InboxItem } from "@/lib/ai/inbox-types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const VND = (n: number) => (Math.round(n) || 0).toLocaleString("vi-VN");

/* ───────── Public types ───────── */
export type ChatEntry =
  | { id: string; kind: "ai_text"; text: string; quickActions?: QuickAction[]; time?: string }
  | { id: string; kind: "ai_proposal"; itemId: string; time?: string }
  | { id: string; kind: "user"; text: string; time?: string }
  | { id: string; kind: "system"; text: string }
  | { id: string; kind: "ai_progress"; current: number; total: number; done?: boolean };

export type QuickAction = { label: string; onClick: () => void };

export type InboxChatProps = {
  contextItem: InboxItem | null;
  items: InboxItem[];
  log: ChatEntry[];
  onUserSend: (text: string) => void;
  onCloseContext: () => void;
  onPickItem: (id: string) => void;
  onApprove: (it: InboxItem) => void;
  onSkip: (it: InboxItem) => void;
  onRule: (it: InboxItem) => void;
  onEdit: (it: InboxItem) => void;
  approving?: boolean;
};

/* ───────── Component ───────── */
export function InboxChat(props: InboxChatProps) {
  const {
    contextItem,
    items,
    log,
    onUserSend,
    onCloseContext,
    onPickItem,
    onApprove,
    onSkip,
    onRule,
    onEdit,
    approving,
  } = props;

  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [log.length, contextItem?.id]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [contextItem?.id]);

  const submit = () => {
    const t = draft.trim();
    if (!t) return;
    setDraft("");
    onUserSend(t);
  };

  return (
    <aside className="flex h-full min-h-0 flex-col border-l border-border/40 bg-card/30">
      {/* Context chip */}
      {contextItem ? (
        <div className="flex shrink-0 items-center gap-2 border-b border-border/40 bg-primary/5 px-4 py-2.5">
          <Link2 className="h-3.5 w-3.5 text-primary" />
          <div className="min-w-0 flex-1 truncate text-[12px]">
            <span className="font-medium text-foreground">Đang xem: </span>
            <span className="text-foreground/90">{contextItem.title}</span>
            <span className="ml-1 text-muted-foreground">
              {contextItem.amount >= 0 ? "+" : "−"}
              {VND(Math.abs(contextItem.amount))}đ
            </span>
            <div className="truncate text-[10.5px] text-muted-foreground">
              Chat đang theo ngữ cảnh mục này
            </div>
          </div>
          <button
            onClick={onCloseContext}
            className="rounded p-1 text-muted-foreground hover:bg-muted/60 hover:text-foreground"
            aria-label="Đóng ngữ cảnh"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}

      {/* Messages */}
      <div ref={scrollRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {log.map((m) => {
          if (m.kind === "system") {
            return (
              <div key={m.id} className="flex justify-center">
                <div className="rounded-full bg-muted/60 px-3 py-1 text-[11px] text-muted-foreground">
                  {m.text}
                </div>
              </div>
            );
          }
          if (m.kind === "user") {
            return <UserBubble key={m.id} text={m.text} time={m.time} />;
          }
          if (m.kind === "ai_progress") {
            return <AiProgress key={m.id} current={m.current} total={m.total} done={m.done} />;
          }
          if (m.kind === "ai_proposal") {
            const it = items.find((x) => x.id === m.itemId) ?? contextItem;
            if (!it) return null;
            return (
              <AiProposalBubble
                key={m.id}
                item={it}
                time={m.time}
                onPickItem={onPickItem}
                onApprove={() => onApprove(it)}
                onSkip={() => onSkip(it)}
                onRule={() => onRule(it)}
                onEdit={() => onEdit(it)}
                approving={!!approving}
              />
            );
          }
          // ai_text
          return (
            <AiTextBubble
              key={m.id}
              text={m.text}
              time={m.time}
              quickActions={m.quickActions}
              onPickItem={onPickItem}
              items={items}
            />
          );
        })}
      </div>

      {/* Composer */}
      <div className="shrink-0 border-t border-border/40 bg-background/60 p-3">
        <div className="flex items-end gap-1.5 rounded-2xl border border-border/50 bg-card px-3 py-2">
          <button
            type="button"
            className="rounded-full p-1.5 text-muted-foreground hover:bg-muted/60"
            aria-label="Đính kèm"
            title="Đính kèm (sắp có)"
          >
            <Paperclip className="h-4 w-4" />
          </button>
          <textarea
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            rows={1}
            placeholder={
              contextItem
                ? `Hỏi gì đó về "${contextItem.title}"…`
                : "Hỏi gì đó hoặc kéo hoá đơn vào…"
            }
            className="max-h-32 flex-1 resize-none bg-transparent py-1 text-sm outline-none placeholder:text-muted-foreground"
          />
          <button
            type="button"
            className="rounded-full p-1.5 text-muted-foreground hover:bg-muted/60"
            aria-label="Ghi âm"
            title="Ghi âm (sắp có)"
          >
            <Mic className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!draft.trim()}
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-full transition",
              draft.trim()
                ? "bg-emerald-600 text-white hover:bg-emerald-700"
                : "bg-muted/60 text-muted-foreground",
            )}
            aria-label="Gửi"
          >
            <Send className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </aside>
  );
}

/* ───────── Bubbles ───────── */
function AiAvatar() {
  return (
    <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white">
      <Sparkles className="h-3.5 w-3.5" />
    </div>
  );
}

function UserBubble({ text, time }: { text: string; time?: string }) {
  return (
    <div className="flex justify-end gap-2">
      <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-muted/60 px-3 py-2 text-sm text-foreground">
        {text}
        {time && <div className="mt-1 text-[10px] text-muted-foreground">{time}</div>}
      </div>
      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-medium text-muted-foreground">
        B
      </div>
    </div>
  );
}

function AiTextBubble({
  text,
  time,
  quickActions,
  onPickItem,
  items,
}: {
  text: string;
  time?: string;
  quickActions?: QuickAction[];
  onPickItem: (id: string) => void;
  items: InboxItem[];
}) {
  return (
    <div className="flex gap-2">
      <AiAvatar />
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex items-baseline gap-2">
          <div className="text-[12px] font-semibold text-foreground">Sổ AI</div>
          {time && <div className="text-[10px] text-muted-foreground">{time}</div>}
        </div>
        <div className="text-sm leading-relaxed text-foreground/90">
          <Rich text={text} items={items} onPickItem={onPickItem} />
        </div>
        {quickActions && quickActions.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {quickActions.map((q, i) => (
              <button
                key={i}
                onClick={q.onClick}
                className="rounded-full border border-border/50 bg-background px-3 py-1 text-[12px] text-foreground/80 transition hover:border-primary/40 hover:bg-primary/5"
              >
                {q.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AiProposalBubble({
  item,
  time,
  onApprove,
  onSkip,
  onRule,
  onEdit,
  onPickItem,
  approving,
}: {
  item: InboxItem;
  time?: string;
  onApprove: () => void;
  onSkip: () => void;
  onRule: () => void;
  onEdit: () => void;
  onPickItem: (id: string) => void;
  approving: boolean;
}) {
  return (
    <div className="flex gap-2">
      <AiAvatar />
      <div className="min-w-0 flex-1 space-y-2.5">
        <div className="flex items-baseline gap-2">
          <div className="text-[12px] font-semibold text-foreground">Sổ AI</div>
          {time && <div className="text-[10px] text-muted-foreground">{time}</div>}
        </div>

        <div className="text-sm leading-relaxed text-foreground/90">
          <Rich text={item.reasoning.summary} items={[item]} onPickItem={onPickItem} />
        </div>

        {/* Entries block */}
        <div className="rounded-lg bg-muted/50 p-3">
          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Bút toán
          </div>
          <div className="space-y-0.5 font-mono text-[12px]">
            {item.proposal.lines.map((l, i) => {
              const side = (l.debit ?? 0) > 0 ? "Nợ" : "Có";
              const amount = (l.debit ?? 0) > 0 ? l.debit! : l.credit ?? 0;
              return (
                <div key={i} className="flex items-baseline gap-2">
                  <span className="w-5 text-muted-foreground">{side}</span>
                  <span className="w-10 font-semibold">{l.account}</span>
                  {l.memo && <span className="truncate text-muted-foreground">· {l.memo}</span>}
                  <span className="ml-auto tabular-nums">{VND(amount)}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Signal pills */}
        <div className="flex flex-wrap gap-1.5">
          {item.reasoning.signals.map((s, i) => (
            <span
              key={i}
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px]",
                s.ok
                  ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                  : "bg-amber-500/10 text-amber-700 dark:text-amber-300",
              )}
            >
              {s.ok ? "✓" : "⚠"} {s.label}
            </span>
          ))}
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-foreground/80">
            Tin cậy {item.confidence}%
          </span>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
          <Button
            size="sm"
            onClick={onApprove}
            disabled={approving || !!item.blocker}
            className="h-8 gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700"
          >
            {approving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <CheckCircle2 className="h-3.5 w-3.5" />
            )}
            Duyệt & ghi sổ
          </Button>
          <Button size="sm" variant="outline" onClick={onEdit} className="h-8 gap-1">
            <Pencil className="h-3 w-3" /> Sửa
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={onSkip}
            className="h-8 px-2"
            aria-label="Bỏ qua"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
          <button
            onClick={onRule}
            className="rounded-full border border-border/50 px-3 py-1 text-[12px] text-foreground/80 transition hover:border-primary/40 hover:bg-primary/5"
          >
            Áp dụng quy tắc cho tương lai
          </button>
        </div>
      </div>
    </div>
  );
}

function AiProgress({ current, total, done }: { current: number; total: number; done?: boolean }) {
  return (
    <div className="flex gap-2">
      <AiAvatar />
      <div className="flex-1">
        <div className="inline-flex items-center gap-2 rounded-2xl rounded-tl-sm bg-muted/40 px-3 py-2 text-sm">
          {done ? (
            <>
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              <span>
                Đã duyệt <strong className="tabular-nums">{current}/{total}</strong> mục
              </span>
            </>
          ) : (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-500" />
              <span>
                Đang duyệt <strong className="tabular-nums">{current}/{total}</strong> mục đã ghi sổ…
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ───────── Rich text with chip parsing ───────── */
const CHIP_RE = /(HĐ\s?\d{3,}|\bTK\s?\d{3}\b|\b1(?:11|12|31|33|38)\b|\b2(?:11|14)\b|\b3(?:31|33|34)\b|\b5(?:11|15)\b|\b6(?:21|22|27|41|42)\b)/g;

function Rich({
  text,
  items,
  onPickItem,
}: {
  text: string;
  items: InboxItem[];
  onPickItem: (id: string) => void;
}) {
  const nodes = useMemo(() => {
    const out: React.ReactNode[] = [];
    // First split by **bold**
    const boldParts = text.split(/(\*\*[^*]+\*\*)/g);
    boldParts.forEach((bp, bi) => {
      if (bp.startsWith("**") && bp.endsWith("**")) {
        out.push(
          <strong key={`b-${bi}`} className="font-semibold text-foreground">
            {bp.slice(2, -2)}
          </strong>,
        );
        return;
      }
      const chipParts = bp.split(CHIP_RE);
      chipParts.forEach((cp, ci) => {
        if (!cp) return;
        if (CHIP_RE.test(cp)) {
          // reset regex state
          CHIP_RE.lastIndex = 0;
          const target = findItemByToken(cp, items);
          out.push(
            <button
              key={`c-${bi}-${ci}`}
              onClick={() => target && onPickItem(target.id)}
              className="mx-0.5 inline-flex items-center rounded bg-emerald-500/10 px-1 py-0 font-mono text-[12px] text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-300"
            >
              {cp.trim()}
            </button>,
          );
        } else {
          out.push(<span key={`t-${bi}-${ci}`}>{cp}</span>);
        }
        CHIP_RE.lastIndex = 0;
      });
    });
    return out;
  }, [text, items, onPickItem]);
  return <>{nodes}</>;
}

function findItemByToken(tok: string, items: InboxItem[]): InboxItem | null {
  const m = tok.match(/HĐ\s?(\d+)/i);
  if (m) {
    const num = m[1];
    return items.find((i) => i.match_ref?.ref?.includes(num) || i.title.includes(num) || i.subtitle?.includes(num)) ?? null;
  }
  return null;
}
