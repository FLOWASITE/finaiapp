import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Pencil,
  X,
  Landmark,
  FileText,
  Lightbulb,
  Command as CmdIcon,
  Loader2,
  Link2,
  ArrowDown,
  Calendar,
  MoreHorizontal,
  TrendingUp,
  ArrowLeft,
} from "lucide-react";
import {
  listInboxAi,
  approveInboxItem,
  skipInboxItem,
  saveInboxRule,
} from "@/lib/inbox-ai.functions";
import type { InboxItem, ConfidenceBand } from "@/lib/ai/inbox-types";
import { Button } from "@/components/ui/button";
import { openAskAi } from "@/lib/open-ask-ai";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/inbox")({
  component: InboxAiPage,
  head: () => ({
    meta: [{ title: "Sổ AI · FinAI" }],
  }),
});

const TABS: Array<{ key: "inbox" | "posted" | "review" | "documents" | "reports"; label: string }> = [
  { key: "inbox", label: "Inbox AI" },
  { key: "posted", label: "Đã hạch toán" },
  { key: "review", label: "Cần xem lại" },
  { key: "documents", label: "Tài liệu" },
  { key: "reports", label: "Báo cáo" },
];

const VND = (n: number) => (Math.round(n) || 0).toLocaleString("vi-VN");

function sourceMeta(it: InboxItem): { icon: any; label: string } {
  if (it.source === "bank_statement") return { icon: Landmark, label: it.source_short || "Sao kê" };
  if (it.source === "ai_insight") return { icon: Lightbulb, label: it.source_short || "AI phát hiện" };
  return { icon: FileText, label: it.source_short || "Hoá đơn vào" };
}

function bandRail(b: ConfidenceBand) {
  if (b === "high") return "before:bg-emerald-500";
  if (b === "medium") return "before:bg-amber-500";
  return "before:bg-rose-500";
}

function bandDot(b: ConfidenceBand) {
  if (b === "high") return "bg-emerald-500";
  if (b === "medium") return "bg-amber-500";
  return "bg-rose-500";
}

function relTime(iso: string) {
  const d = Date.now() - new Date(iso).getTime();
  const m = Math.round(d / 60000);
  if (m < 1) return "vừa xong";
  if (m < 60) return `${m} phút trước`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} giờ trước`;
  return `${Math.round(h / 24)} ngày trước`;
}

function periodLabel() {
  const d = new Date();
  return `T${d.getMonth() + 1}/${d.getFullYear()}`;
}

function InboxAiPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("inbox");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [cmdOpen, setCmdOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const [showScrollDown, setShowScrollDown] = useState(false);

  const listFn = useServerFn(listInboxAi);
  const approveFn = useServerFn(approveInboxItem);
  const skipFn = useServerFn(skipInboxItem);
  const ruleFn = useServerFn(saveInboxRule);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["inbox-ai", tab],
    queryFn: () =>
      listFn({ data: { tab: tab === "reports" ? "inbox" : (tab as any), search: "" } }),
    refetchOnWindowFocus: false,
  });

  const items = data?.items ?? [];
  const stats = data?.stats;
  const highCount = items.filter((i) => i.confidence_band === "high" && !i.blocker).length;

  const activeItem = useMemo(
    () => items.find((i) => i.id === activeId) ?? items[0] ?? null,
    [items, activeId],
  );

  useEffect(() => {
    if (!activeId && items[0]) setActiveId(items[0].id);
  }, [items, activeId]);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const onScroll = () => {
      setShowScrollDown(el.scrollHeight - el.scrollTop - el.clientHeight > 200);
    };
    onScroll();
    el.addEventListener("scroll", onScroll);
    return () => el.removeEventListener("scroll", onScroll);
  }, [items.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCmdOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const approveM = useMutation({
    mutationFn: async (it: InboxItem) =>
      approveFn({
        data: {
          source: (it.source === "bank_statement" ? "bank_statement" : it.source === "ai_insight" ? "ai_insight" : "document") as any,
          external_id: it.external_id,
          description: it.proposal.description,
          entry_date: it.proposal.entry_date,
          lines: it.proposal.lines.map((l) => ({
            account_code: l.account,
            debit: l.debit ?? 0,
            credit: l.credit ?? 0,
            memo: l.memo,
          })),
          confidence_at_decision: it.confidence,
          match_ref_invoice_id: it.match_ref?.kind === "invoice" ? it.match_ref.id : undefined,
        },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["inbox-ai"] }),
  });

  const skipM = useMutation({
    mutationFn: async (it: InboxItem) =>
      skipFn({
        data: {
          source: (it.source === "bank_statement" ? "bank_statement" : it.source === "ai_insight" ? "ai_insight" : "document") as any,
          external_id: it.external_id,
        },
      }),
    onSuccess: () => {
      toast.success("Đã bỏ qua");
      qc.invalidateQueries({ queryKey: ["inbox-ai"] });
    },
  });

  const ruleM = useMutation({
    mutationFn: async (it: InboxItem) =>
      ruleFn({
        data: {
          source: (it.source === "bank_statement" ? "bank_statement" : it.source === "ai_insight" ? "ai_insight" : "document") as any,
          external_id: it.external_id,
          pattern_kind: it.partner ? "partner" : "memo",
          pattern_value: it.partner || it.title.slice(0, 80),
          apply_account: it.proposal.lines[0]?.account,
          confidence_boost: 25,
          note: `Học từ "${it.title}"`,
        },
      }),
    onSuccess: () => {
      toast.success("AI sẽ nhớ quy tắc này cho tương lai");
      qc.invalidateQueries({ queryKey: ["inbox-ai"] });
    },
    onError: (e: any) => toast.error(e?.message || "Lưu quy tắc thất bại"),
  });

  const approveAllHigh = async () => {
    const targets = items.filter((i) => i.confidence_band === "high" && !i.blocker);
    if (!targets.length) {
      toast.info("Không có mục tin cậy cao nào");
      return;
    }
    let ok = 0;
    for (const it of targets) {
      try {
        await approveM.mutateAsync(it);
        ok++;
      } catch {}
    }
    toast.success(`Đã ghi sổ ${ok}/${targets.length} mục`);
  };

  return (
    <div className="flex h-screen w-full flex-col bg-gradient-to-b from-background via-background to-muted/10">
      {/* Top header */}
      <header className="flex shrink-0 items-center gap-3 border-b border-border/40 px-5 py-3.5">
        <Link
          to="/dashboard"
          className="flex h-9 w-9 items-center justify-center rounded-md border border-border/40 text-muted-foreground transition hover:bg-muted/40 hover:text-foreground"
          title="Quay lại"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-emerald-600 font-semibold text-white">
          S
        </div>
        <div className="text-sm font-semibold tracking-tight">Sổ AI</div>
        <div className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
          </span>
          AI đang xử lý
        </div>

        <button
          type="button"
          onClick={() => setCmdOpen(true)}
          className="ml-2 flex h-9 flex-1 items-center gap-2 rounded-lg border border-border/50 bg-card/50 px-3 text-left text-sm text-muted-foreground transition hover:border-primary/40 hover:bg-card"
        >
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          <span className="flex-1 truncate">
            Hỏi AI: "Chi phí marketing tháng này?", "Đối chiếu HĐ với sao kê"…
          </span>
          <kbd className="hidden rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] sm:inline">⌘K</kbd>
        </button>

        <div className="flex items-center gap-1.5 rounded-md border border-border/40 px-2.5 py-1.5 text-xs text-muted-foreground">
          <Calendar className="h-3.5 w-3.5" />
          {periodLabel()}
        </div>
        <button className="flex h-9 w-9 items-center justify-center rounded-md border border-border/40 text-muted-foreground hover:bg-muted/40 hover:text-foreground">
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </header>

      {/* Stats strip */}
      <div className="flex shrink-0 items-center gap-8 border-b border-border/40 px-5 py-4">
        <Stat label="Chờ duyệt" value={String(stats?.pending ?? "—")} />
        <Divider />
        <Stat
          label="AI đã hạch toán hôm nay"
          value={String(stats?.posted_today ?? 0)}
          extra={
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
              <TrendingUp className="h-2.5 w-2.5" /> tiết kiệm ~4h
            </span>
          }
        />
        <Divider />
        <Stat label="Độ chính xác" value={stats?.accuracy != null ? `${stats.accuracy}%` : "98.4%"} />

        <div className="ml-auto">
          <Button
            variant="outline"
            onClick={approveAllHigh}
            disabled={approveM.isPending || highCount === 0}
            className="gap-2 border-border/60"
          >
            {approveM.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Duyệt tất cả tin cậy cao ({highCount})
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex shrink-0 items-center gap-1 border-b border-border/40 px-5">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "relative flex items-center gap-2 px-4 py-3 text-sm font-medium transition",
              tab === t.key
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
            {t.key === "inbox" && stats?.pending ? (
              <span className="rounded-full bg-foreground px-1.5 py-0.5 text-[10px] font-semibold text-background tabular-nums">
                {stats.pending}
              </span>
            ) : null}
            {tab === t.key && (
              <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-foreground" />
            )}
          </button>
        ))}
      </div>

      {/* Body */}
      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[minmax(0,1fr)_minmax(420px,560px)]">
        {/* LIST */}
        <div className="relative min-h-0 overflow-hidden border-r border-border/40">
          <div ref={listRef} className="h-full overflow-y-auto">
            {tab === "reports" || tab === "documents" || tab === "posted" || tab === "review" ? (
              <EmptyTab label={TABS.find((t) => t.key === tab)!.label} />
            ) : isLoading ? (
              <ListSkeleton />
            ) : items.length === 0 ? (
              <EmptyInbox />
            ) : (
              <>
                <ul className="space-y-3 p-4">
                  {items.map((it) => (
                    <ItemCard
                      key={it.id}
                      item={it}
                      active={activeItem?.id === it.id}
                      onClick={() => setActiveId(it.id)}
                    />
                  ))}
                </ul>
                {stats && stats.pending > items.length && (
                  <div className="px-4 pb-6">
                    <div className="inline-flex items-center rounded-full bg-muted/60 px-3 py-1 text-[11px] text-muted-foreground">
                      + {stats.pending - items.length} mục khác
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {showScrollDown && (
            <button
              type="button"
              onClick={() =>
                listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" })
              }
              className="absolute bottom-5 right-5 flex h-9 w-9 items-center justify-center rounded-full border border-border bg-background shadow-lg transition hover:bg-muted"
              aria-label="Cuộn xuống"
            >
              <ArrowDown className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* REASONING PANEL */}
        <ReasoningPanel
          item={activeItem}
          onApprove={() =>
            activeItem &&
            approveM.mutate(activeItem, {
              onSuccess: () => toast.success("Đã ghi sổ"),
              onError: (e: any) => toast.error(e?.message || "Không ghi sổ được"),
            })
          }
          onSkip={() => activeItem && skipM.mutate(activeItem)}
          onRule={() => activeItem && ruleM.mutate(activeItem)}
          onEdit={() =>
            activeItem && openAskAi(`Sửa đề xuất "${activeItem.title}": `)
          }
          onAsk={(q) =>
            activeItem &&
            openAskAi(`Về mục "${activeItem.title}" (${VND(activeItem.amount)} ₫): ${q}`)
          }
          approving={approveM.isPending}
          skipping={skipM.isPending}
          rulePending={ruleM.isPending}
        />
      </div>

      {cmdOpen && <CommandBar onClose={() => setCmdOpen(false)} />}
    </div>
  );
}

/* ───────── Stats ───────── */
function Stat({ label, value, extra }: { label: string; value: string; extra?: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <div className="text-2xl font-semibold tabular-nums tracking-tight">{value}</div>
        {extra}
      </div>
    </div>
  );
}
function Divider() {
  return <div className="h-10 w-px bg-border/50" />;
}

/* ───────── Item Card ───────── */
function ItemCard({
  item,
  active,
  onClick,
}: {
  item: InboxItem;
  active: boolean;
  onClick: () => void;
}) {
  const meta = sourceMeta(item);
  const SrcIcon = meta.icon;
  const isInflow = item.source === "bank_statement" && item.amount > 0 &&
    /chuyển khoản|tt|thanh toan|payment|transfer/i.test(item.title + " " + (item.subtitle ?? ""));
  const isOutflow = item.source === "bank_statement" && !isInflow;
  const sign = item.source === "bank_statement" ? (isOutflow ? "−" : "+") : "";

  return (
    <li
      onClick={onClick}
      className={cn(
        "group relative cursor-pointer overflow-hidden rounded-lg border bg-card transition",
        "before:absolute before:inset-y-0 before:left-0 before:w-1",
        bandRail(item.confidence_band),
        active
          ? "border-foreground/20 bg-accent/30 shadow-sm before:w-1.5"
          : "border-border/50 hover:border-border hover:bg-card/80",
      )}
    >
      <div className="pl-4 pr-4 py-3">
        {/* Row 1: source pill + sub + match + dot */}
        <div className="flex items-center gap-2 text-[11px]">
          <span className="inline-flex items-center gap-1 rounded-md bg-muted/60 px-1.5 py-0.5 font-medium text-foreground/80">
            <SrcIcon className="h-3 w-3" />
            {meta.label}
          </span>
          <span className="text-muted-foreground">{relTime(item.occurred_at)}</span>
          {item.subtitle && item.source !== "bank_statement" && (
            <>
              <span className="text-muted-foreground">·</span>
              <span className="truncate text-muted-foreground">{item.subtitle}</span>
            </>
          )}
          <div className="ml-auto flex items-center gap-2">
            {item.match_ref && (
              <span className="inline-flex items-center gap-1 rounded-md bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-medium text-sky-700 dark:text-sky-300">
                <Link2 className="h-2.5 w-2.5" /> Khớp {item.match_ref.ref}
              </span>
            )}
            <span
              className={cn("h-2 w-2 rounded-full", bandDot(item.confidence_band))}
              title={`Tin cậy ${item.confidence}%`}
            />
          </div>
        </div>

        {/* Row 2: title + amount */}
        <div className="mt-1.5 flex items-baseline justify-between gap-3">
          <div className="truncate text-[15px] font-semibold tracking-tight text-foreground">
            {item.title}
          </div>
          <div className="shrink-0 text-[15px] font-semibold tabular-nums text-foreground">
            {sign}
            {VND(Math.abs(item.amount))} <span className="text-muted-foreground">đ</span>
          </div>
        </div>

        {/* Row 3: memo (for bank) */}
        {item.source === "bank_statement" && item.subtitle && (
          <div className="mt-0.5 text-[11px] italic text-muted-foreground">
            "{item.subtitle}"
          </div>
        )}

        {/* Row 4: proposed entry pills */}
        {item.proposal.lines.length > 0 && !item.blocker && (
          <div className="mt-2 inline-flex flex-wrap gap-1.5 rounded-md bg-muted/40 px-2 py-1.5">
            {item.proposal.lines.slice(0, 4).map((l, i) => {
              const side = (l.debit ?? 0) > 0 ? "Nợ" : "Có";
              const amount = (l.debit ?? 0) > 0 ? l.debit! : l.credit ?? 0;
              return (
                <span key={i} className="font-mono text-[11px] text-foreground/85">
                  <span className="text-muted-foreground">{side}</span>{" "}
                  <span className="font-semibold">{l.account}</span>{" "}
                  <span className="tabular-nums">{VND(amount)}</span>
                </span>
              );
            })}
          </div>
        )}

        {/* Row 5: blocker / followup */}
        {item.blocker ? (
          <div className="mt-2 flex items-start gap-1.5 rounded-md border border-rose-500/30 bg-rose-500/5 px-2 py-1.5 text-[11px] text-rose-700 dark:text-rose-300">
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
            <span>
              {item.blocker.reason}
              {item.blocker.notified && (
                <span className="text-muted-foreground"> · AI đã gửi tin cho {item.blocker.notified}.</span>
              )}
            </span>
          </div>
        ) : item.followups[0] && item.confidence_band === "medium" ? (
          <div className="mt-2 flex items-start gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/5 px-2 py-1.5 text-[11px] text-amber-700 dark:text-amber-300">
            <Lightbulb className="mt-0.5 h-3 w-3 shrink-0" />
            <span>{item.followups[0]}</span>
          </div>
        ) : null}
      </div>
    </li>
  );
}

/* ───────── Reasoning Panel ───────── */
function ReasoningPanel({
  item,
  onApprove,
  onSkip,
  onRule,
  onEdit,
  onAsk,
  approving,
  skipping,
  rulePending,
}: {
  item: InboxItem | null;
  onApprove: () => void;
  onSkip: () => void;
  onRule: () => void;
  onEdit: () => void;
  onAsk: (q: string) => void;
  approving: boolean;
  skipping: boolean;
  rulePending: boolean;
}) {
  if (!item) {
    return (
      <div className="hidden h-full items-center justify-center bg-card/30 p-10 text-center text-sm text-muted-foreground lg:flex">
        <div>
          <Sparkles className="mx-auto mb-3 h-6 w-6 opacity-50" />
          Chọn một mục để xem AI lập luận.
        </div>
      </div>
    );
  }

  const questions = [
    "Tại sao lại là TK này mà không phải khác?",
    item.partner ? `Tổng đã thu của ${item.partner} là bao nhiêu?` : "Tóm tắt các giao dịch tương tự gần đây",
  ];

  return (
    <div className="hidden h-full overflow-y-auto bg-card/30 lg:block">
      <div className="space-y-5 p-6">
        <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          AI lập luận
        </div>

        {/* Narrative */}
        <p className="text-sm leading-relaxed text-foreground/90">
          {renderReasoningProse(item)}
        </p>

        {/* Proposed entry block */}
        <div className="rounded-lg bg-muted/40 p-3">
          <div className="mb-2 text-[11px] uppercase tracking-wider text-muted-foreground">
            Bút toán đề xuất
          </div>
          <div className="space-y-1 font-mono text-xs">
            {item.proposal.lines.map((l, i) => {
              const side = (l.debit ?? 0) > 0 ? "Nợ" : "Có";
              const amount = (l.debit ?? 0) > 0 ? l.debit! : l.credit ?? 0;
              return (
                <div key={i} className="flex items-baseline gap-3">
                  <span className="text-muted-foreground">{side}</span>
                  <span className="font-semibold text-foreground">{l.account}</span>
                  {l.memo && <span className="text-muted-foreground">— {l.memo}</span>}
                  <span className="ml-auto tabular-nums text-foreground">{VND(amount)}</span>
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
                "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px]",
                s.ok
                  ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300"
                  : "border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-300",
              )}
            >
              {s.ok ? "✓" : "⚠"} {s.label}
            </span>
          ))}
          <span className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background px-2.5 py-0.5 text-[11px] text-foreground/80">
            Tin cậy {item.confidence}%
          </span>
        </div>

        {item.blocker && (
          <div className="rounded-md border border-rose-500/30 bg-rose-500/5 p-3 text-xs">
            <div className="flex items-center gap-1.5 font-medium text-rose-600 dark:text-rose-400">
              <AlertTriangle className="h-3.5 w-3.5" />
              {item.blocker.reason}
            </div>
            {item.blocker.notified && (
              <div className="mt-1 text-muted-foreground">AI đã gửi tin cho {item.blocker.notified}</div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 pt-1">
          <Button
            onClick={onApprove}
            disabled={approving || !!item.blocker}
            className="flex-1 gap-2 bg-emerald-600 text-white hover:bg-emerald-700"
          >
            {approving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Duyệt & ghi sổ
          </Button>
          <Button variant="outline" onClick={onEdit} className="gap-1.5">
            <Pencil className="h-3.5 w-3.5" /> Sửa
          </Button>
          <Button variant="outline" size="icon" onClick={onSkip} disabled={skipping} aria-label="Bỏ qua">
            {skipping ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-4 w-4" />}
          </Button>
        </div>

        {/* Ask AI */}
        <div className="border-t border-border/40 pt-4">
          <div className="mb-2 text-[11px] uppercase tracking-wider text-muted-foreground">
            Hỏi AI về mục này
          </div>
          <div className="space-y-1.5">
            {questions.map((q) => (
              <button
                key={q}
                onClick={() => onAsk(q)}
                className="w-full rounded-md border border-border/40 bg-background/40 px-3 py-2 text-left text-xs text-foreground/80 transition hover:border-primary/30 hover:bg-primary/5 hover:text-foreground"
              >
                {q}
              </button>
            ))}
            <button
              onClick={onRule}
              disabled={rulePending}
              className="flex w-full items-center gap-2 rounded-md border border-border/40 bg-background/40 px-3 py-2 text-left text-xs text-foreground/80 transition hover:border-primary/30 hover:bg-primary/5 hover:text-foreground disabled:opacity-50"
            >
              {rulePending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3 text-primary" />}
              Áp dụng quy tắc này cho mục tương lai
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function renderReasoningProse(item: InboxItem) {
  // If summary already exists, render with simple bold for partner/amount/match
  const partner = item.partner;
  const matchRef = item.match_ref?.ref;
  const summary = item.reasoning.summary || `${item.title} — ${VND(item.amount)} ₫.`;
  const parts: Array<{ t: string; b?: boolean }> = [];
  let rest = summary;
  const tokens = [partner, matchRef, `${VND(item.amount)}`, `${VND(item.amount)} ₫`].filter(Boolean) as string[];
  // Simple split by tokens
  const re = new RegExp(`(${tokens.map((t) => t.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")).join("|")})`, "g");
  if (tokens.length === 0) {
    parts.push({ t: summary });
  } else {
    const split = rest.split(re);
    for (const s of split) {
      if (!s) continue;
      parts.push({ t: s, b: tokens.includes(s) });
    }
  }
  return parts.map((p, i) => (p.b ? <strong key={i} className="text-foreground">{p.t}</strong> : <span key={i}>{p.t}</span>));
}

/* ───────── Command Bar ───────── */
function CommandBar({ onClose }: { onClose: () => void }) {
  const [value, setValue] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const suggestions = [
    "Chi phí marketing tháng này?",
    "Đối chiếu hoá đơn với sao kê tuần này",
    "Hạch toán hết Grab vào TK 642",
    "Tìm hoá đơn chưa khớp >5 triệu",
  ];

  const submit = (text: string) => {
    onClose();
    openAskAi(text);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-background/60 p-4 pt-[12vh] backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl overflow-hidden rounded-xl border border-border/60 bg-card shadow-2xl"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (value.trim()) submit(value.trim());
          }}
          className="flex items-center gap-2 border-b border-border/40 px-3"
        >
          <CmdIcon className="h-4 w-4 text-muted-foreground" />
          <input
            ref={ref}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Ra lệnh hoặc hỏi bằng tiếng Việt…"
            className="flex-1 bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground"
          />
          <kbd className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">esc</kbd>
        </form>
        <div className="p-2">
          <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground">Gợi ý</div>
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => submit(s)}
              className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-muted/60"
            >
              <Sparkles className="h-3.5 w-3.5 text-primary/70" /> {s}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ───────── Empty / Skeleton ───────── */
function EmptyInbox() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-10 text-center text-sm text-muted-foreground">
      <CheckCircle2 className="h-8 w-8 text-emerald-500/70" />
      <div className="font-medium text-foreground">Hộp đến trống</div>
      <div className="text-xs">AI sẽ thả đề xuất vào đây khi có hoá đơn, sao kê mới.</div>
    </div>
  );
}

function EmptyTab({ label }: { label: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-1.5 p-10 text-center text-sm text-muted-foreground">
      <div className="font-medium text-foreground">{label}</div>
      <div className="text-xs">Sắp có — đang dựng.</div>
    </div>
  );
}

function ListSkeleton() {
  return (
    <ul className="space-y-3 p-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <li key={i} className="rounded-lg border border-border/40 bg-card/40 p-4">
          <div className="h-3 w-1/3 animate-pulse rounded bg-muted/50" />
          <div className="mt-3 h-4 w-2/3 animate-pulse rounded bg-muted/50" />
          <div className="mt-2 h-3 w-1/2 animate-pulse rounded bg-muted/40" />
        </li>
      ))}
    </ul>
  );
}
