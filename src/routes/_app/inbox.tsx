import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Inbox as InboxIcon,
  Sparkles,
  Search,
  CheckCircle2,
  Circle,
  AlertTriangle,
  Pencil,
  SkipForward,
  Landmark,
  FileText,
  Lightbulb,
  Command as CmdIcon,
  ArrowRight,
  Zap,
  Loader2,
  Link2,
} from "lucide-react";
import {
  listInboxAi,
  approveInboxItem,
  skipInboxItem,
  saveInboxRule,
} from "@/lib/inbox-ai.functions";
import type { InboxItem, ConfidenceBand } from "@/lib/ai/inbox-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { openAskAi } from "@/lib/open-ask-ai";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/inbox")({
  component: InboxAiPage,
  head: () => ({
    meta: [{ title: "Sổ AI · FinAI" }],
  }),
});

const TABS: Array<{ key: "inbox" | "posted" | "review" | "documents"; label: string }> = [
  { key: "inbox", label: "Hộp đến" },
  { key: "review", label: "Cần xem lại" },
  { key: "posted", label: "Đã hạch toán" },
  { key: "documents", label: "Tài liệu" },
];

const VND = (n: number) => (Math.round(n) || 0).toLocaleString("vi-VN") + " ₫";

function sourceIcon(src: InboxItem["source"]) {
  if (src === "bank_statement") return Landmark;
  if (src === "ai_insight") return Lightbulb;
  return FileText;
}

function bandStyles(b: ConfidenceBand) {
  if (b === "high") return { dot: "bg-emerald-500", ring: "ring-emerald-500/30", text: "text-emerald-600 dark:text-emerald-400", label: "Tự tin cao" };
  if (b === "medium") return { dot: "bg-amber-500", ring: "ring-amber-500/30", text: "text-amber-600 dark:text-amber-400", label: "Cần xem" };
  return { dot: "bg-rose-500", ring: "ring-rose-500/30", text: "text-rose-600 dark:text-rose-400", label: "Rủi ro" };
}

function relTime(iso: string) {
  const d = Date.now() - new Date(iso).getTime();
  const m = Math.round(d / 60000);
  if (m < 1) return "vừa xong";
  if (m < 60) return `${m}p`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.round(h / 24)} ngày`;
}

function InboxAiPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("inbox");
  const [search, setSearch] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [cmdOpen, setCmdOpen] = useState(false);
  const [bandFilter, setBandFilter] = useState<"all" | ConfidenceBand>("all");


  const listFn = useServerFn(listInboxAi);
  const approveFn = useServerFn(approveInboxItem);
  const skipFn = useServerFn(skipInboxItem);
  const ruleFn = useServerFn(saveInboxRule);
  const qc = useQueryClient();

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["inbox-ai", tab, search],
    queryFn: () => listFn({ data: { tab, search } }),
    refetchOnWindowFocus: false,
  });

  const allItems = data?.items ?? [];
  const stats = data?.stats;
  const items = useMemo(
    () => (bandFilter === "all" ? allItems : allItems.filter((i) => i.confidence_band === bandFilter)),
    [allItems, bandFilter],
  );
  const bandCounts = useMemo(() => {
    const c = { high: 0, medium: 0, low: 0 } as Record<ConfidenceBand, number>;
    for (const i of allItems) c[i.confidence_band]++;
    return c;
  }, [allItems]);
  const activeItem = useMemo(
    () => items.find((i) => i.id === activeId) ?? items[0] ?? null,
    [items, activeId],
  );


  useEffect(() => {
    if (!activeId && items[0]) setActiveId(items[0].id);
  }, [items, activeId]);

  // Cmd-K shortcut
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
    onSuccess: () => {
      toast.success("Đã ghi sổ");
      qc.invalidateQueries({ queryKey: ["inbox-ai"] });
    },
    onError: (e: any) => toast.error(e?.message || "Không ghi sổ được"),
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

  const bulkApprove = async () => {
    const highConf = items.filter((i) => selected.has(i.id) && i.confidence_band === "high" && !i.blocker);
    if (!highConf.length) {
      toast.info("Chọn mục 🟢 đủ tự tin để duyệt hàng loạt");
      return;
    }
    for (const it of highConf) await approveM.mutateAsync(it);
    setSelected(new Set());
  };

  return (
    <div className="flex h-[calc(100vh-3.5rem)] w-full flex-col bg-background">
      {/* Top bar */}
      <header className="flex flex-col gap-3 border-b border-border/40 px-6 py-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
              <InboxIcon className="h-4 w-4" />
            </div>
            <div>
              <h1 className="text-base font-semibold leading-tight tracking-tight">Sổ AI</h1>
              <p className="text-[11px] text-muted-foreground">
                AI đã chuẩn bị {stats?.pending ?? 0} đề xuất · {stats?.posted_today ?? 0} đã ghi hôm nay
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setCmdOpen(true)}
            className="group flex h-9 w-full max-w-md items-center gap-2 rounded-lg border border-border/50 bg-card/40 px-3 text-left text-sm text-muted-foreground transition hover:border-primary/40 hover:bg-card"
          >
            <CmdIcon className="h-3.5 w-3.5" />
            <span className="flex-1 truncate">Ra lệnh cho AI — "Hạch toán hết Grab vào 642"…</span>
            <kbd className="hidden rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] sm:inline">⌘K</kbd>
          </button>

          <Button onClick={() => openAskAi()} variant="outline" size="sm" className="gap-1.5">
            <Sparkles className="h-3.5 w-3.5" /> Trợ lý
          </Button>
        </div>

        {/* Tabs + search */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-1">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium transition",
                  tab === t.key
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                )}
              >
                {t.label}
                {t.key === "inbox" && stats?.pending ? (
                  <span className="ml-1.5 text-[10px] opacity-70">{stats.pending}</span>
                ) : null}
              </button>
            ))}
          </div>

          <div className="relative w-72">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm theo đối tác, nội dung…"
              className="h-8 pl-8 text-xs"
            />
          </div>
        </div>
      </header>

      {/* Bulk bar */}
      {selected.size > 0 && (
        <div className="flex items-center justify-between border-b border-border/40 bg-emerald-500/5 px-6 py-2">
          <div className="text-xs">
            Đã chọn <strong>{selected.size}</strong> mục ·{" "}
            <span className="text-muted-foreground">
              {items.filter((i) => selected.has(i.id) && i.confidence_band === "high").length} đủ tự tin để duyệt nhanh
            </span>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              Bỏ chọn
            </Button>
            <Button size="sm" onClick={bulkApprove} disabled={approveM.isPending} className="gap-1.5">
              {approveM.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
              Duyệt nhanh các mục 🟢
            </Button>
          </div>
        </div>
      )}

      {/* Body: list + reasoning */}
      <div className="grid flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[minmax(0,1fr)_minmax(380px,520px)]">
        {/* LIST */}
        <ScrollArea className="h-full border-r border-border/40">
          {tab !== "inbox" ? (
            <EmptyTab label={TABS.find((t) => t.key === tab)?.label ?? ""} />
          ) : isLoading ? (
            <ListSkeleton />
          ) : items.length === 0 ? (
            <EmptyInbox />
          ) : (
            <ul className="divide-y divide-border/30">
              {items.map((it) => (
                <ItemRow
                  key={it.id}
                  item={it}
                  active={activeItem?.id === it.id}
                  checked={selected.has(it.id)}
                  onCheck={(c) => {
                    const next = new Set(selected);
                    if (c) next.add(it.id);
                    else next.delete(it.id);
                    setSelected(next);
                  }}
                  onClick={() => setActiveId(it.id)}
                />
              ))}
            </ul>
          )}
          {isFetching && !isLoading && (
            <div className="flex items-center justify-center gap-2 py-3 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Đang cập nhật…
            </div>
          )}
        </ScrollArea>

        {/* REASONING */}
        <ReasoningPanel
          item={activeItem}
          onApprove={() => activeItem && approveM.mutate(activeItem)}
          onSkip={() => activeItem && skipM.mutate(activeItem)}
          onRule={() => activeItem && ruleM.mutate(activeItem)}
          onEdit={() =>
            activeItem &&
            openAskAi(`Sửa đề xuất "${activeItem.title}": `)
          }
          onAsk={() =>
            activeItem &&
            openAskAi(`Giải thích đề xuất "${activeItem.title}" (${VND(activeItem.amount)})`)
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

/* ───────── List Row ───────── */
function ItemRow({
  item,
  active,
  checked,
  onCheck,
  onClick,
}: {
  item: InboxItem;
  active: boolean;
  checked: boolean;
  onCheck: (c: boolean) => void;
  onClick: () => void;
}) {
  const Icon = sourceIcon(item.source);
  const band = bandStyles(item.confidence_band);
  const debitLine = item.proposal.lines.find((l) => (l.debit ?? 0) > 0);
  const creditLine = item.proposal.lines.find((l) => (l.credit ?? 0) > 0);

  return (
    <li
      onClick={onClick}
      className={cn(
        "group cursor-pointer px-5 py-3.5 transition",
        active ? "bg-accent/40" : "hover:bg-muted/30",
      )}
    >
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onCheck(!checked);
          }}
          className="mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded border border-border/60 transition hover:border-foreground/60"
          aria-label="Chọn"
        >
          {checked ? <CheckCircle2 className="h-4 w-4 text-primary" /> : null}
        </button>

        <div className="relative mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted/60 text-muted-foreground">
          <Icon className="h-3.5 w-3.5" />
          <span
            className={cn(
              "absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-background",
              band.dot,
            )}
            title={band.label}
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <span className="truncate text-sm font-medium text-foreground">{item.title}</span>
              {item.match_ref && (
                <Badge variant="outline" className="gap-1 border-sky-500/40 text-[10px] text-sky-600 dark:text-sky-400">
                  <Link2 className="h-2.5 w-2.5" /> Khớp {item.match_ref.ref}
                </Badge>
              )}
              {item.blocker && (
                <Badge variant="outline" className="gap-1 border-rose-500/40 text-[10px] text-rose-600 dark:text-rose-400">
                  <AlertTriangle className="h-2.5 w-2.5" /> {item.blocker.reason}
                </Badge>
              )}
            </div>
            <div className="shrink-0 text-sm font-semibold tabular-nums text-foreground">{VND(item.amount)}</div>
          </div>

          <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
            <span>{item.source_short}</span>
            {item.partner && <><span>·</span><span className="truncate">{item.partner}</span></>}
            <span>·</span>
            <span>{relTime(item.occurred_at)}</span>
            <span className={cn("ml-auto font-medium", band.text)}>● {item.confidence}%</span>
          </div>

          {/* Proposed entry inline */}
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            {debitLine && (
              <span>
                <span className="text-rose-600 dark:text-rose-400">Nợ {debitLine.account}</span>{" "}
                <span className="tabular-nums">{VND(debitLine.debit ?? 0)}</span>
              </span>
            )}
            {creditLine && (
              <span>
                <span className="text-emerald-600 dark:text-emerald-400">Có {creditLine.account}</span>{" "}
                <span className="tabular-nums">{VND(creditLine.credit ?? 0)}</span>
              </span>
            )}
            {item.proposal.lines.length > 2 && (
              <span className="text-muted-foreground/70">+{item.proposal.lines.length - 2} dòng</span>
            )}
          </div>
        </div>
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
  onAsk: () => void;
  approving: boolean;
  skipping: boolean;
  rulePending: boolean;
}) {
  if (!item) {
    return (
      <div className="hidden h-full items-center justify-center p-10 text-center text-sm text-muted-foreground lg:flex">
        <div>
          <Sparkles className="mx-auto mb-3 h-6 w-6 opacity-50" />
          Chọn một mục để xem lập luận của AI.
        </div>
      </div>
    );
  }

  const band = bandStyles(item.confidence_band);

  return (
    <ScrollArea className="hidden h-full bg-card/30 lg:block">
      <div className="space-y-5 p-6">
        {/* Header */}
        <div>
          <div className="mb-2 flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
            <span className={cn("h-2 w-2 rounded-full", band.dot)} />
            <span className={band.text}>{band.label} · {item.confidence}%</span>
            <span>·</span>
            <span>{item.source_label}</span>
          </div>
          <h2 className="text-lg font-semibold leading-snug tracking-tight">{item.title}</h2>
          {item.subtitle && <p className="mt-1 text-xs text-muted-foreground">{item.subtitle}</p>}
          <div className="mt-3 text-2xl font-semibold tabular-nums">{VND(item.amount)}</div>
        </div>

        {item.blocker && (
          <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-3 text-xs">
            <div className="flex items-center gap-1.5 font-medium text-rose-600 dark:text-rose-400">
              <AlertTriangle className="h-3.5 w-3.5" />
              Khoá: {item.blocker.reason}
            </div>
            {item.blocker.notified && (
              <div className="mt-1 text-muted-foreground">Đã báo {item.blocker.notified}</div>
            )}
          </div>
        )}

        {/* Proposed journal */}
        <section>
          <div className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Bút toán đề xuất
          </div>
          <div className="overflow-hidden rounded-lg border border-border/40">
            <table className="w-full text-xs">
              <thead className="bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-1.5 text-left">Tài khoản</th>
                  <th className="px-3 py-1.5 text-right">Nợ</th>
                  <th className="px-3 py-1.5 text-right">Có</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {item.proposal.lines.map((l, i) => (
                  <tr key={i}>
                    <td className="px-3 py-1.5 font-mono">{l.account}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-rose-600 dark:text-rose-400">
                      {l.debit ? VND(l.debit) : ""}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-emerald-600 dark:text-emerald-400">
                      {l.credit ? VND(l.credit) : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-1.5 text-[11px] text-muted-foreground">
            Ngày ghi sổ: <span className="font-medium text-foreground">{item.proposal.entry_date}</span>
          </div>
        </section>

        {/* Signals */}
        <section>
          <div className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Vì sao AI đề xuất
          </div>
          <p className="mb-2 text-xs text-foreground/80">{item.reasoning.summary}</p>
          <div className="flex flex-wrap gap-1.5">
            {item.reasoning.signals.map((s, i) => (
              <span
                key={i}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px]",
                  s.ok
                    ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300"
                    : "border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-300",
                )}
              >
                {s.ok ? "✓" : "⚠"} {s.label}
              </span>
            ))}
          </div>
        </section>

        {item.match_ref && (
          <section className="rounded-lg border border-sky-500/30 bg-sky-500/5 p-3">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5 font-medium text-sky-700 dark:text-sky-300">
                <Link2 className="h-3.5 w-3.5" />
                Khớp với hoá đơn {item.match_ref.ref}
              </div>
              <Link
                to="/invoices/$invoiceId"
                params={{ invoiceId: item.match_ref.id }}
                className="text-[11px] font-medium text-sky-600 hover:underline dark:text-sky-400"
              >
                Mở →
              </Link>
            </div>
          </section>
        )}

        {item.followups.length > 0 && (
          <section>
            <div className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Việc tiếp theo
            </div>
            <ul className="space-y-1 text-xs text-foreground/80">
              {item.followups.map((f, i) => (
                <li key={i} className="flex items-start gap-2">
                  <Circle className="mt-1 h-2 w-2 shrink-0 fill-current opacity-50" />
                  {f}
                </li>
              ))}
            </ul>
          </section>
        )}

        <Separator />

        {/* Actions */}
        <div className="flex flex-col gap-2">
          <Button onClick={onApprove} disabled={approving || !!item.blocker} className="gap-2">
            {approving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Duyệt & ghi sổ
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" size="sm" onClick={onEdit} className="gap-1.5">
              <Pencil className="h-3.5 w-3.5" /> Sửa
            </Button>
            <Button variant="ghost" size="sm" onClick={onSkip} disabled={skipping} className="gap-1.5">
              <SkipForward className="h-3.5 w-3.5" /> Bỏ qua
            </Button>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onRule}
            disabled={rulePending}
            className="justify-start gap-2 text-xs text-muted-foreground hover:text-foreground"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Áp dụng quy tắc này cho tương lai
          </Button>
        </div>

        {/* Ask */}
        <div className="rounded-lg border border-border/40 bg-background/40 p-3">
          <button
            onClick={onAsk}
            className="flex w-full items-center justify-between gap-2 text-xs text-muted-foreground hover:text-foreground"
          >
            <span className="flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              Hỏi AI về mục này
            </span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </ScrollArea>
  );
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
    "Hạch toán hết Grab tháng này vào 642",
    "Đối chiếu sao kê tuần này",
    "Tìm hoá đơn chưa khớp >5 triệu",
    "Tóm tắt chi phí marketing tháng",
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
    <ul className="divide-y divide-border/30">
      {Array.from({ length: 6 }).map((_, i) => (
        <li key={i} className="flex gap-3 px-5 py-4">
          <div className="h-7 w-7 animate-pulse rounded-lg bg-muted/50" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-2/3 animate-pulse rounded bg-muted/50" />
            <div className="h-2.5 w-1/3 animate-pulse rounded bg-muted/40" />
          </div>
        </li>
      ))}
    </ul>
  );
}
