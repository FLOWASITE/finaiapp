import {
  CheckCircle2,
  Pencil,
  X,
  Loader2,
  Sparkles,
  AlertTriangle,
  Lightbulb,
  MessageSquare,
  ArrowRight,
  ChevronRight,
  Wand2,
  Check,
} from "lucide-react";
import type { InboxItem } from "@/lib/ai/inbox-types";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import {
  getInboxThread,
  getOrCreateInboxThread,
  getThread,
  appendMessage,
} from "@/lib/chat-threads.functions";
import { useRef, useState } from "react";
import { toast } from "sonner";

const VND = (n: number) => (Math.round(n) || 0).toLocaleString("vi-VN");

function formatRelative(iso: string) {
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "vừa xong";
  if (diff < 3600) return `${Math.floor(diff / 60)} phút trước`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} giờ trước`;
  return d.toLocaleDateString("vi-VN");
}

export type InboxItemSheetProps = {
  item: InboxItem | null;
  onClose: () => void;
  onApprove: (it: InboxItem) => void;
  onSkip: (it: InboxItem) => void;
  onRule: (it: InboxItem) => void;
  onEdit: (it: InboxItem) => void;
  approving?: boolean;
};

export function InboxItemSheet({
  item,
  onClose,
  onApprove,
  onSkip,
  onRule,
  onEdit,
  approving,
}: InboxItemSheetProps) {
  const open = !!item;

  const contentRef = useRef<HTMLDivElement | null>(null);
  const gesture = useRef<{
    startX: number; startY: number; startT: number;
    active: boolean; decided: boolean; width: number;
  } | null>(null);

  const resetTransform = (animate: boolean) => {
    const el = contentRef.current;
    if (!el) return;
    if (animate) {
      el.style.transition = "transform 200ms ease-out";
      el.style.transform = "translateX(0px)";
      window.setTimeout(() => {
        if (!contentRef.current) return;
        contentRef.current.style.transition = "";
        contentRef.current.style.transform = "";
      }, 220);
    } else {
      el.style.transition = "";
      el.style.transform = "";
    }
  };

  const onTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (typeof window === "undefined" || window.innerWidth >= 640) return;
    const t = e.touches[0];
    gesture.current = {
      startX: t.clientX, startY: t.clientY, startT: performance.now(),
      active: true, decided: false,
      width: contentRef.current?.offsetWidth ?? window.innerWidth,
    };
  };
  const onTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g || !g.active) return;
    const t = e.touches[0];
    const dx = t.clientX - g.startX;
    const dy = t.clientY - g.startY;
    if (!g.decided) {
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
      if (Math.abs(dy) > Math.abs(dx) || dx < 0) { g.active = false; return; }
      g.decided = true;
    }
    if (dx > 0) {
      const el = contentRef.current;
      if (el) { el.style.transition = ""; el.style.transform = `translateX(${dx}px)`; }
    }
  };
  const onTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    const g = gesture.current;
    gesture.current = null;
    if (!g || !g.active || !g.decided) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - g.startX;
    const dt = Math.max(1, performance.now() - g.startT);
    const velocity = dx / dt;
    if (dx > g.width * 0.3 || velocity > 0.5) {
      onClose();
      window.setTimeout(() => resetTransform(false), 0);
    } else { resetTransform(true); }
  };

  const partnerName = item?.partner?.trim();
  const hasPartner = !!partnerName && partnerName !== "—";
  const confidence = item?.confidence ?? 0;
  const confTone =
    confidence >= 80 ? "emerald" : confidence >= 50 ? "amber" : "rose";
  const confClasses = {
    emerald: { text: "text-emerald-600 dark:text-emerald-400", bar: "bg-emerald-500", chip: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300" },
    amber:   { text: "text-amber-600 dark:text-amber-400",   bar: "bg-amber-500",   chip: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300" },
    rose:    { text: "text-rose-600 dark:text-rose-400",    bar: "bg-rose-500",    chip: "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300" },
  }[confTone];

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent
        ref={contentRef}
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-lg"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute left-1.5 top-1/2 h-10 w-1 -translate-y-1/2 rounded-full bg-border/60 sm:hidden"
        />
        {item && (
          <>
            {/* Header */}
            <SheetHeader className="shrink-0 space-y-0 border-b border-border/60 px-5 py-4 text-left">
              <div className="flex items-center gap-2.5">
                <div className={cn("flex h-8 w-8 items-center justify-center rounded-full", confClasses.chip)}>
                  <Sparkles className="h-4 w-4" />
                </div>
                <div className="space-y-1">
                  <SheetTitle className="text-sm font-semibold leading-none text-foreground">
                    Đề xuất của Sổ AI
                  </SheetTitle>
                  <div className="flex items-center gap-1.5">
                    <div className="h-1 w-12 overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn("h-full transition-all", confClasses.bar)}
                        style={{ width: `${Math.max(4, Math.min(100, confidence))}%` }}
                      />
                    </div>
                    <span className={cn("text-[10px] font-bold uppercase tracking-wider", confClasses.text)}>
                      Tin cậy {confidence}%
                    </span>
                  </div>
                </div>
              </div>
              <SheetDescription className="sr-only">
                Đề xuất bút toán từ AI cho {item.title}
              </SheetDescription>
            </SheetHeader>

            {/* Body */}
            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5">
              {/* Summary */}
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Đối tác
                  </p>
                  <h3 className={cn(
                    "truncate text-lg font-semibold leading-tight",
                    hasPartner ? "text-foreground" : "italic text-muted-foreground/80",
                  )}>
                    {hasPartner ? partnerName : "Chưa xác định tên"}
                  </h3>
                  <p className="truncate text-xs text-muted-foreground">
                    {item.title}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-2xl font-bold leading-none tracking-tight text-foreground tabular-nums">
                    {item.amount >= 0 ? "+" : "−"}
                    {VND(Math.abs(item.amount))}{" "}
                    <span className="text-base font-medium text-muted-foreground">đ</span>
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {formatRelative(item.occurred_at)}
                  </p>
                </div>
              </div>

              {/* Trust strip */}
              <div className="flex flex-wrap items-center gap-1.5 rounded-xl bg-muted/60 p-1">
                <div className="flex items-center gap-1.5 rounded-lg border border-border/60 bg-background px-2.5 py-1.5 shadow-sm">
                  <Check className="h-3.5 w-3.5 text-emerald-500" strokeWidth={3} />
                  <span className="text-xs font-medium text-foreground/80">OCR đã đọc đầy đủ</span>
                </div>
                {item.followups[0] && (
                  <button
                    type="button"
                    className="group flex flex-1 items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-500/10 dark:text-amber-300"
                  >
                    <span className="flex items-center gap-1.5 truncate">
                      <Lightbulb className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{item.followups[0]}</span>
                    </span>
                    <ChevronRight className="h-3 w-3 shrink-0 transition-transform group-hover:translate-x-0.5" />
                  </button>
                )}
              </div>

              {/* Reasoning */}
              {item.reasoning.summary && (
                <p className="text-sm leading-relaxed text-foreground/85">
                  {item.reasoning.summary}
                </p>
              )}

              {/* Accounting entries */}
              <div className="space-y-3 rounded-2xl border border-border/60 bg-muted/30 p-4">
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  Bút toán đề xuất
                </span>
                <div className="space-y-2.5">
                  {item.proposal.lines.map((l, i, arr) => {
                    const isDebit = (l.debit ?? 0) > 0;
                    const amount = isDebit ? l.debit! : l.credit ?? 0;
                    const sideLabel = isDebit ? "Nợ" : "Có";
                    const next = arr[i + 1];
                    const isLastDebit = isDebit && next && !((next.debit ?? 0) > 0);
                    return (
                      <div key={i}>
                        <div className="grid grid-cols-[28px_44px_1fr_auto] items-center gap-3">
                          <span className={cn(
                            "text-xs font-bold",
                            isDebit ? "text-blue-600 dark:text-blue-400" : "text-rose-600 dark:text-rose-400",
                          )}>
                            {sideLabel}
                          </span>
                          <span className={cn(
                            "rounded px-1.5 py-0.5 text-center font-mono text-xs font-medium",
                            isDebit
                              ? "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300"
                              : "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300",
                          )}>
                            {l.account}
                          </span>
                          <span className="truncate text-xs text-muted-foreground">
                            {l.memo || "—"}
                          </span>
                          <span className="font-mono text-xs font-semibold tabular-nums text-foreground">
                            {VND(amount)}
                          </span>
                        </div>
                        {isLastDebit && <div className="mx-1 mt-2.5 h-px bg-border/70" />}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Signals */}
              {item.reasoning.signals.length > 0 && (
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
                </div>
              )}

              {/* Blocker */}
              {item.blocker && (
                <div className="flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-500/5 px-3 py-2 text-[12px] text-rose-700 dark:text-rose-300">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    {item.blocker.reason}
                    {item.blocker.notified && (
                      <span className="text-muted-foreground">
                        {" "}· AI đã gửi tin cho {item.blocker.notified}.
                      </span>
                    )}
                  </span>
                </div>
              )}

              {/* Chat history */}
              <InboxChatHistory item={item} />
            </div>

            {/* Footer */}
            <div className="shrink-0 space-y-2.5 border-t border-border/60 bg-background/80 px-5 py-4 backdrop-blur-sm">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => onApprove(item)}
                  disabled={approving || !!item.blocker}
                  className="flex flex-[3] items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-primary to-primary/85 px-4 py-3.5 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:shadow-primary/30 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none"
                >
                  {approving ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-5 w-5 opacity-90" />
                  )}
                  Duyệt &amp; ghi sổ
                </button>
                <button
                  type="button"
                  onClick={() => onEdit(item)}
                  aria-label="Sửa"
                  className="flex flex-1 items-center justify-center rounded-2xl border border-border bg-background py-3.5 text-foreground/80 transition-colors hover:bg-muted"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => onSkip(item)}
                  aria-label="Bỏ qua"
                  className="flex w-12 items-center justify-center rounded-2xl border border-border bg-background py-3.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <button
                type="button"
                onClick={() => onRule(item)}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-primary/20 bg-primary/5 py-2 text-xs font-semibold text-primary transition-all hover:bg-primary/10"
              >
                <Wand2 className="h-3.5 w-3.5" />
                Áp dụng quy tắc cho tương lai
              </button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function InboxChatHistory({ item }: { item: InboxItem }) {
  const navigate = useNavigate();
  const getInboxThreadFn = useServerFn(getInboxThread);
  const getThreadFn = useServerFn(getThread);
  const getOrCreateFn = useServerFn(getOrCreateInboxThread);
  const appendFn = useServerFn(appendMessage);
  const [starting, setStarting] = useState(false);

  const threadQ = useQuery({
    queryKey: ["inbox-thread", item.external_id],
    queryFn: () => getInboxThreadFn({ data: { externalId: item.external_id } }),
    staleTime: 10_000,
  });
  const threadId = threadQ.data?.id ?? null;

  const messagesQ = useQuery({
    queryKey: ["inbox-thread-messages", threadId],
    queryFn: () => getThreadFn({ data: { threadId: threadId! } }),
    enabled: !!threadId,
    staleTime: 5_000,
  });

  const messages = messagesQ.data?.messages ?? [];
  const hasHistory = messages.length > 0;

  const startOrContinue = async () => {
    if (starting) return;
    setStarting(true);
    try {
      const thread = await getOrCreateFn({
        data: { externalId: item.external_id, title: item.title.slice(0, 60) },
      });
      const fromHref =
        typeof window !== "undefined"
          ? window.location.pathname + window.location.search
          : undefined;

      if (!hasHistory) {
        const prefill = `Về mục "${item.title}"${item.partner ? ` (${item.partner})` : ""}: `;
        await appendFn({
          data: {
            threadId: thread.id,
            role: "user",
            content: prefill,
            updateTitleIfBlank: true,
          },
        });
        navigate({
          to: "/chat/$threadId",
          params: { threadId: thread.id },
          search: fromHref ? { autostart: "1", from: fromHref } : { autostart: "1" },
        });
      } else {
        navigate({
          to: "/chat/$threadId",
          params: { threadId: thread.id },
          search: fromHref ? { from: fromHref } : {},
        });
      }
    } catch (e: any) {
      toast.error(e?.message || "Không mở được cuộc trò chuyện");
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        <MessageSquare className="h-3.5 w-3.5" />
        Lịch sử trao đổi với AI
      </div>

      {threadQ.isLoading ? (
        <div className="h-10 animate-pulse rounded-xl bg-muted/40" />
      ) : hasHistory ? (
        <div className="max-h-64 space-y-2 overflow-y-auto rounded-xl border border-border/60 bg-muted/20 p-2">
          {messages.map((m) => {
            if (m.role === "system") {
              return (
                <div key={m.id} className="text-center text-[10px] text-muted-foreground">
                  {m.content}
                </div>
              );
            }
            const mine = m.role === "user";
            return (
              <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[85%] rounded-2xl px-3 py-1.5 text-[12px] leading-snug",
                    mine
                      ? "bg-primary text-primary-foreground"
                      : "border border-border/60 bg-background",
                  )}
                >
                  <div className="whitespace-pre-wrap">{m.content}</div>
                  <div
                    className={cn(
                      "mt-0.5 text-[9px] opacity-60",
                      mine ? "text-primary-foreground" : "text-muted-foreground",
                    )}
                  >
                    {formatRelative(m.created_at)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border bg-muted/30 px-3 py-3 text-center text-[11px] text-muted-foreground">
          Chưa có trao đổi nào. Bấm bên dưới để bắt đầu hỏi AI về mục này.
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={starting}
          onClick={startOrContinue}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-border bg-background px-3 py-2 text-[12px] font-semibold text-foreground/80 transition-colors hover:bg-muted disabled:opacity-60"
        >
          {starting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Sparkles className="h-3.5 w-3.5 text-primary" />
          )}
          {hasHistory ? "Tiếp tục trao đổi" : "Hỏi AI về mục này"}
        </button>
        {hasHistory && threadId && (
          <button
            type="button"
            onClick={() => {
              const fromHref =
                typeof window !== "undefined"
                  ? window.location.pathname + window.location.search
                  : undefined;
              navigate({
                to: "/chat/$threadId",
                params: { threadId },
                search: fromHref ? { from: fromHref } : {},
              });
            }}
            className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
          >
            Mở đầy đủ <ArrowRight className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
}
