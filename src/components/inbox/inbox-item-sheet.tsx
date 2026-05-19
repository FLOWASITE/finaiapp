import { CheckCircle2, Pencil, X, Loader2, Sparkles, AlertTriangle, Lightbulb, MessageSquare, ArrowRight } from "lucide-react";
import type { InboxItem } from "@/lib/ai/inbox-types";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { openAskAi } from "@/lib/open-ask-ai";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import {
  getInboxThread,
  getOrCreateInboxThread,
  getThread,
  appendMessage,
} from "@/lib/chat-threads.functions";
import { useState } from "react";
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
  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-lg"
      >
        {item && (
          <>
            <SheetHeader className="shrink-0 space-y-2 border-b border-border/40 px-5 py-4 text-left">
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <Sparkles className="h-3 w-3 text-emerald-500" />
                <span>Đề xuất của Sổ AI · Tin cậy {item.confidence}%</span>
              </div>
              <SheetTitle className="text-base font-semibold leading-snug">
                {item.title}
              </SheetTitle>
              <SheetDescription className="flex items-baseline gap-2 text-xs">
                {item.partner && <span className="text-foreground/80">{item.partner}</span>}
                <span className="ml-auto text-base font-semibold tabular-nums text-foreground">
                  {item.amount >= 0 ? "+" : "−"}
                  {VND(Math.abs(item.amount))} <span className="text-muted-foreground">đ</span>
                </span>
              </SheetDescription>
            </SheetHeader>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
              {/* Reasoning */}
              <div className="text-sm leading-relaxed text-foreground/90">
                {item.reasoning.summary}
              </div>

              {/* Entries */}
              <div className="rounded-lg bg-muted/50 p-3">
                <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Bút toán đề xuất
                </div>
                <div className="space-y-0.5 font-mono text-[12px]">
                  {item.proposal.lines.map((l, i) => {
                    const side = (l.debit ?? 0) > 0 ? "Nợ" : "Có";
                    const amount = (l.debit ?? 0) > 0 ? l.debit! : l.credit ?? 0;
                    return (
                      <div key={i} className="flex items-baseline gap-2">
                        <span className="w-5 text-muted-foreground">{side}</span>
                        <span className="w-10 font-semibold">{l.account}</span>
                        {l.memo && (
                          <span className="truncate text-muted-foreground">· {l.memo}</span>
                        )}
                        <span className="ml-auto tabular-nums">{VND(amount)}</span>
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

              {/* Blocker / followup */}
              {item.blocker ? (
                <div className="flex items-start gap-2 rounded-md border border-rose-500/30 bg-rose-500/5 px-3 py-2 text-[12px] text-rose-700 dark:text-rose-300">
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
              ) : item.followups[0] ? (
                <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[12px] text-amber-700 dark:text-amber-300">
                  <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>{item.followups[0]}</span>
                </div>
              ) : null}

              {/* Chat history + Hỏi AI */}
              <InboxChatHistory item={item} />

            </div>

            {/* Footer actions */}
            <div className="shrink-0 space-y-2 border-t border-border/40 bg-background/60 px-5 py-3">
              <div className="flex flex-wrap items-center gap-1.5">
                <Button
                  size="sm"
                  onClick={() => onApprove(item)}
                  disabled={approving || !!item.blocker}
                  className="h-9 flex-1 gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700"
                >
                  {approving ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  )}
                  Duyệt & ghi sổ
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onEdit(item)}
                  className="h-9 gap-1"
                >
                  <Pencil className="h-3 w-3" /> Sửa
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onSkip(item)}
                  className="h-9 px-2.5"
                  aria-label="Bỏ qua"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
              <button
                type="button"
                onClick={() => onRule(item)}
                className="w-full rounded-md border border-border/50 px-3 py-1.5 text-[12px] text-foreground/80 transition hover:border-primary/40 hover:bg-primary/5"
              >
                Áp dụng quy tắc cho tương lai
              </button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
