import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Sparkles,
  CheckCircle2,
  AlertTriangle,
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
  MessageSquare,
  Inbox as InboxIcon,
  Columns2,
} from "lucide-react";

type PaneMode = "split" | "inbox" | "chat";
import {
  listInboxAi,
  approveInboxItem,
  skipInboxItem,
  saveInboxRule,
} from "@/lib/inbox-ai.functions";
import type { InboxItem, ConfidenceBand } from "@/lib/ai/inbox-types";
import { mockInboxItems, mockInboxStats } from "@/data/mockInbox";
import { Button } from "@/components/ui/button";
import { openAskAi } from "@/lib/open-ask-ai";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { InboxChat, type ChatEntry } from "@/components/inbox/inbox-chat";

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

/* ───────── Chat log reducer ───────── */
type ChatAction =
  | { type: "push"; entry: ChatEntry }
  | { type: "patch"; id: string; patch: Partial<ChatEntry> }
  | { type: "reset"; entries: ChatEntry[] };

function chatReducer(state: ChatEntry[], a: ChatAction): ChatEntry[] {
  if (a.type === "reset") return a.entries;
  if (a.type === "push") return [...state, a.entry];
  if (a.type === "patch")
    return state.map((e) => (e.id === a.id ? ({ ...e, ...a.patch } as ChatEntry) : e));
  return state;
}

const nowHM = () =>
  new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
const uid = () => Math.random().toString(36).slice(2, 9);

function InboxAiPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("inbox");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [inboxOpenMobile, setInboxOpenMobile] = useState(false);
  const [paneMode, setPaneMode] = useState<PaneMode>("split");
  const listRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Map<string, HTMLLIElement>>(new Map());
  const [showScrollDown, setShowScrollDown] = useState(false);
  const prevPendingRef = useRef<number | null>(null);
  const [recentlyReadDelta, setRecentlyReadDelta] = useState<number | null>(null);

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

  const serverItems = data?.items ?? [];
  const usingMock = serverItems.length === 0;
  const [dismissedMock, setDismissedMock] = useState<Set<string>>(new Set());
  const items = useMemo(
    () => (usingMock ? mockInboxItems.filter((i) => !dismissedMock.has(i.id)) : serverItems),
    [usingMock, serverItems, dismissedMock],
  );
  const stats = usingMock
    ? { ...mockInboxStats, pending: Math.max(0, mockInboxStats.pending - dismissedMock.size) }
    : data?.stats;
  const highCount = items.filter((i) => i.confidence_band === "high" && !i.blocker).length;

  const contextItem = useMemo(
    () => items.find((i) => i.id === activeId) ?? null,
    [items, activeId],
  );

  // Track "AI online · vừa đọc N hoá đơn"
  useEffect(() => {
    const p = stats?.pending ?? null;
    if (p == null) return;
    if (prevPendingRef.current != null) {
      const d = p - prevPendingRef.current;
      if (d > 0) setRecentlyReadDelta(d);
    }
    prevPendingRef.current = p;
  }, [stats?.pending]);

  // Chat log
  const [chatLog, dispatch] = useReducer(chatReducer, [] as ChatEntry[]);
  const seededRef = useRef(false);
  useEffect(() => {
    if (seededRef.current) return;
    seededRef.current = true;
    dispatch({
      type: "push",
      entry: {
        id: uid(),
        kind: "ai_text",
        time: nowHM(),
        text: `Chào sếp. Đêm qua tôi đã hạch toán **${stats?.posted_today ?? 132} mục** tự động. Còn **${stats?.pending ?? 47} mục** cần sếp duyệt — trong đó **${highCount || 32} mục tin cậy cao** có thể duyệt hàng loạt.`,
        quickActions: [
          { label: `Duyệt ${highCount || 32} mục tin cậy cao`, onClick: () => approveAllHighRef.current?.() },
          { label: "Xem mục cần review", onClick: () => setTab("review") },
        ],
      },
    });
  }, [stats?.pending, stats?.posted_today, highCount]);

  useEffect(() => {
    if (showScrollDown) {
      /* noop */
    }
  }, [showScrollDown]);

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
      const tag = (e.target as HTMLElement | null)?.tagName;
      const typing = tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement | null)?.isContentEditable;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCmdOpen(true);
        return;
      }
      if (typing) return;
      if ((e.metaKey || e.ctrlKey) && e.key === "1") {
        e.preventDefault();
        setPaneMode((m) => (m === "inbox" ? "split" : "inbox"));
      } else if ((e.metaKey || e.ctrlKey) && e.key === "2") {
        e.preventDefault();
        setPaneMode((m) => (m === "chat" ? "split" : "chat"));
      } else if (e.key === "Escape") {
        setPaneMode((m) => (m === "split" ? m : "split"));
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ["inbox-ai"] }),
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ["inbox-ai"] }),
    onError: (e: any) => toast.error(e?.message || "Lưu quy tắc thất bại"),
  });

  const isMock = (it: InboxItem) => it.id.startsWith("mock-");
  const dismissMock = (id: string) =>
    setDismissedMock((s) => {
      const n = new Set(s);
      n.add(id);
      return n;
    });

  /* ───── Inbox ↔ Chat sync handlers ───── */

  const pushAi = useCallback((text: string) => {
    dispatch({ type: "push", entry: { id: uid(), kind: "ai_text", text, time: nowHM() } });
  }, []);
  const pushSystem = useCallback((text: string) => {
    dispatch({ type: "push", entry: { id: uid(), kind: "system", text } });
  }, []);
  const pushProposal = useCallback((itemId: string) => {
    dispatch({ type: "push", entry: { id: uid(), kind: "ai_proposal", itemId, time: nowHM() } });
  }, []);

  const pickItem = useCallback(
    (id: string) => {
      setActiveId(id);
      const el = cardRefs.current.get(id);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      // Push a proposal bubble if last entry is not already this proposal
      const last = chatLog[chatLog.length - 1];
      if (!(last && last.kind === "ai_proposal" && last.itemId === id)) {
        pushProposal(id);
      }
    },
    [chatLog, pushProposal],
  );

  const handleCardClick = useCallback(
    (id: string) => {
      pickItem(id);
    },
    [pickItem],
  );

  const closeContext = useCallback(() => {
    setActiveId(null);
    pushSystem("Đã đóng ngữ cảnh — chat trở về chế độ chung");
  }, [pushSystem]);

  const handleApproveItem = useCallback(
    (it: InboxItem) => {
      const finish = () => {
        pushSystem(`✓ Đã ghi sổ: ${it.title}`);
        if (activeId === it.id) setActiveId(null);
      };
      if (isMock(it)) {
        dismissMock(it.id);
        finish();
        return;
      }
      approveM.mutate(it, {
        onSuccess: finish,
        onError: (e: any) => toast.error(e?.message || "Không ghi sổ được"),
      });
    },
    [activeId, approveM, pushSystem],
  );

  const handleSkipItem = useCallback(
    (it: InboxItem) => {
      if (isMock(it)) {
        dismissMock(it.id);
        pushSystem(`Đã bỏ qua: ${it.title}`);
        if (activeId === it.id) setActiveId(null);
        return;
      }
      skipM.mutate(it, {
        onSuccess: () => {
          pushSystem(`Đã bỏ qua: ${it.title}`);
          if (activeId === it.id) setActiveId(null);
        },
      });
    },
    [activeId, skipM, pushSystem],
  );

  const handleRuleItem = useCallback(
    (it: InboxItem) => {
      if (isMock(it)) {
        pushSystem(`AI sẽ nhớ quy tắc cho các mục giống "${it.partner || it.title}"`);
        return;
      }
      ruleM.mutate(it, {
        onSuccess: () => pushSystem(`AI sẽ nhớ quy tắc cho "${it.partner || it.title}"`),
      });
    },
    [ruleM, pushSystem],
  );

  const handleEditItem = useCallback(
    (it: InboxItem) => {
      openAskAi(`Sửa đề xuất "${it.title}": `);
    },
    [],
  );

  /* ───── User message → mock AI response ───── */
  const respondMock = useCallback(
    (userText: string) => {
      const lc = userText.toLowerCase();
      const ci = contextItem;
      // Canned: 131 vs 511 for context = mock-2
      if (ci?.id === "mock-2" && (/131|511/.test(userText))) {
        pushAi(
          `Vì đây là **tiền vào** ghi nhận thanh toán cho HĐ 00125 đã xuất ngày 28/10 — doanh thu được ghi vào TK 511 lúc đó rồi, giờ chỉ đảo công nợ phải thu (131) sang tiền (112). Bút toán đề xuất: Nợ 112 / Có 131 cùng 55.000.000 ₫.`,
        );
        return;
      }
      if (ci && /tại sao|why|giải thích/.test(lc)) {
        pushAi(
          `Mục **${ci.title}** được đề xuất vì: ${ci.reasoning.summary}`,
        );
        return;
      }
      if (!ci) {
        pushAi("Em chưa có ngữ cảnh. Sếp chọn một mục bên trái, hoặc cứ hỏi tự do em sẽ trả lời.");
        return;
      }
      pushAi(
        `Em ghi nhận. Liên quan đến mục **${ci.title}** — sếp muốn em đề xuất bút toán khác hay áp dụng quy tắc?`,
      );
    },
    [contextItem, pushAi],
  );

  const handleUserSend = useCallback(
    (text: string) => {
      dispatch({ type: "push", entry: { id: uid(), kind: "user", text, time: nowHM() } });
      setTimeout(() => respondMock(text), 400);
    },
    [respondMock],
  );

  /* ───── Bulk approve with chat progress ───── */
  const approveAllHighRef = useRef<(() => Promise<void>) | null>(null);
  const approveAllHigh = useCallback(async () => {
    const targets = items.filter((i) => i.confidence_band === "high" && !i.blocker);
    if (!targets.length) {
      pushSystem("Không có mục tin cậy cao nào để duyệt");
      return;
    }
    pushSystem(`↑ Sếp vừa nhấn Duyệt ${targets.length} mục tin cậy cao ở thanh trên`);
    const progressId = uid();
    dispatch({
      type: "push",
      entry: { id: progressId, kind: "ai_progress", current: 0, total: targets.length },
    });
    let ok = 0;
    for (const it of targets) {
      try {
        if (isMock(it)) {
          dismissMock(it.id);
          ok++;
        } else {
          await approveM.mutateAsync(it);
          ok++;
        }
        dispatch({ type: "patch", id: progressId, patch: { current: ok } as any });
        await new Promise((r) => setTimeout(r, 120));
      } catch {}
    }
    dispatch({ type: "patch", id: progressId, patch: { current: ok, done: true } as any });
  }, [items, approveM, pushSystem]);
  approveAllHighRef.current = approveAllHigh;

  // If context item disappears (was approved/skipped externally), auto close
  useEffect(() => {
    if (activeId && !items.find((i) => i.id === activeId)) {
      setActiveId(null);
    }
  }, [items, activeId]);

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
        <div
          className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-300"
          title="Cập nhật cuối: vừa xong"
        >
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
          </span>
          AI online
          <span className="hidden text-emerald-700/70 sm:inline dark:text-emerald-300/70">
            ·{" "}
            {recentlyReadDelta
              ? `vừa đọc ${recentlyReadDelta} hoá đơn mới`
              : "đang theo dõi"}
          </span>
        </div>

        <button
          type="button"
          onClick={() => setCmdOpen(true)}
          className="ml-2 hidden h-9 flex-1 items-center gap-2 rounded-lg border border-border/50 bg-card/50 px-3 text-left text-sm text-muted-foreground transition hover:border-primary/40 hover:bg-card lg:flex"
        >
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          <span className="flex-1 truncate">
            Hỏi AI: "Chi phí marketing tháng này?", "Đối chiếu HĐ với sao kê"…
          </span>
          <kbd className="hidden rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] sm:inline">⌘K</kbd>
        </button>

        <div className="ml-auto hidden items-center gap-1.5 rounded-md border border-border/40 px-2.5 py-1.5 text-xs text-muted-foreground lg:flex">
          <Calendar className="h-3.5 w-3.5" />
          {periodLabel()}
        </div>
        {/* Mobile: open Inbox overlay */}
        <button
          onClick={() => setInboxOpenMobile((v) => !v)}
          className="relative flex h-9 items-center gap-1.5 rounded-md border border-border/40 px-2.5 text-xs font-medium text-muted-foreground hover:bg-muted/40 hover:text-foreground lg:hidden"
          aria-label="Mở Inbox"
        >
          <InboxIcon className="h-4 w-4" />
          <span>Inbox</span>
          {stats?.pending ? (
            <span className="rounded-full bg-foreground px-1.5 py-0.5 text-[10px] font-semibold text-background tabular-nums">
              {stats.pending}
            </span>
          ) : null}
        </button>

        {/* Desktop: pane mode segmented control */}
        <div className="hidden items-center gap-0.5 rounded-md border border-border/40 p-0.5 lg:flex">
          {([
            { k: "inbox", label: "Inbox", icon: InboxIcon, sc: "⌘1" },
            { k: "split", label: "Split", icon: Columns2, sc: "" },
            { k: "chat", label: "Chat", icon: MessageSquare, sc: "⌘2" },
          ] as const).map((m) => (
            <button
              key={m.k}
              onClick={() => setPaneMode(m.k as PaneMode)}
              title={m.sc ? `${m.label} (${m.sc})` : m.label}
              className={cn(
                "flex h-7 items-center gap-1.5 rounded px-2 text-[11px] font-medium transition",
                paneMode === m.k
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:bg-muted/40 hover:text-foreground",
              )}
            >
              <m.icon className="h-3.5 w-3.5" />
              {m.label}
            </button>
          ))}
        </div>
        <button className="flex h-9 w-9 items-center justify-center rounded-md border border-border/40 text-muted-foreground hover:bg-muted/40 hover:text-foreground">
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </header>

      {/* Stats strip */}
      <div className="hidden shrink-0 items-center gap-8 border-b border-border/40 px-5 py-4 lg:flex">
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
      <div className="flex shrink-0 items-center gap-1 overflow-x-auto whitespace-nowrap border-b border-border/40 px-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:px-5">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "relative flex shrink-0 items-center gap-2 px-3 py-2.5 text-sm font-medium transition lg:px-4 lg:py-3",
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

      {/* Body — Desktop: pane-mode driven grid */}
      <div
        className={cn(
          "hidden min-h-0 flex-1 overflow-hidden lg:grid",
          paneMode === "split" && "lg:grid-cols-[minmax(0,1fr)_minmax(420px,520px)]",
          paneMode === "inbox" && "lg:grid-cols-[1fr]",
          paneMode === "chat" && "lg:grid-cols-[1fr]",
        )}
      >
        {/* LIST */}
        {paneMode !== "chat" && (
          <div className="relative min-h-0 overflow-hidden">
            <div ref={listRef} className="h-full overflow-y-auto">
              {tab === "reports" || tab === "documents" || tab === "posted" || tab === "review" ? (
                <EmptyTab label={TABS.find((t) => t.key === tab)!.label} />
              ) : isLoading ? (
                <ListSkeleton />
              ) : items.length === 0 ? (
                <EmptyInbox />
              ) : (
                <>
                  <ul className={cn("space-y-3 p-4", paneMode === "inbox" && "mx-auto max-w-3xl")}>
                    {items.map((it) => (
                      <ItemCard
                        key={it.id}
                        item={it}
                        active={activeId === it.id}
                        onClick={() => handleCardClick(it.id)}
                        registerRef={(el) => {
                          if (el) cardRefs.current.set(it.id, el);
                          else cardRefs.current.delete(it.id);
                        }}
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
        )}

        {/* CHAT */}
        {paneMode !== "inbox" && (
          <div className="min-h-0">
            <InboxChat
              contextItem={contextItem}
              items={items}
              log={chatLog}
              onUserSend={handleUserSend}
              onCloseContext={closeContext}
              onPickItem={pickItem}
              onApprove={handleApproveItem}
              onSkip={handleSkipItem}
              onRule={handleRuleItem}
              onEdit={handleEditItem}
              approving={approveM.isPending}
            />
          </div>
        )}
      </div>

      {/* Mobile: nội dung theo tab */}
      <div className="block min-h-0 flex-1 overflow-hidden lg:hidden">
        {tab === "inbox" ? (
          <InboxChat
            contextItem={contextItem}
            items={items}
            log={chatLog}
            onUserSend={handleUserSend}
            onCloseContext={closeContext}
            onPickItem={pickItem}
            onApprove={handleApproveItem}
            onSkip={handleSkipItem}
            onRule={handleRuleItem}
            onEdit={handleEditItem}
            approving={approveM.isPending}
          />
        ) : (
          <div className="h-full overflow-y-auto">
            <EmptyTab label={TABS.find((t) => t.key === tab)!.label} />
          </div>
        )}
      </div>

      {/* Mobile: Inbox overlay (slide from left) */}
      {inboxOpenMobile && (
        <MobileInboxOverlay onClose={() => setInboxOpenMobile(false)}>
          <div className="flex items-center justify-between border-b border-border/40 px-4 py-3">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <InboxIcon className="h-4 w-4" />
                Inbox
                {stats?.pending ? (
                  <span className="rounded-full bg-foreground px-1.5 py-0.5 text-[10px] font-semibold text-background tabular-nums">
                    {stats.pending}
                  </span>
                ) : null}
              </div>
              <button
                onClick={() => setInboxOpenMobile(false)}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Đóng
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {isLoading ? (
                <div className="space-y-3 p-4" role="status" aria-live="polite">
                  <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    {INBOX_COPY.loading}
                  </div>
                  <ListSkeleton />
                </div>
              ) : items.length === 0 ? (
                <div className="p-4">
                  <EmptyInbox />
                </div>

              ) : (
                <ul className="space-y-3 p-4">
                  {items.map((it) => (
                    <ItemCard
                      key={it.id}
                      item={it}
                      active={activeId === it.id}
                      onClick={() => {
                        handleCardClick(it.id);
                        setInboxOpenMobile(false);
                      }}
                      registerRef={() => {}}
                    />
                  ))}
                  {stats && stats.pending > items.length && (
                    <li className="pt-1 text-center text-[11px] text-muted-foreground">
                      + {stats.pending - items.length} mục khác
                    </li>
                  )}
                </ul>
              )}
            </div>

        </MobileInboxOverlay>
      )}


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
  registerRef,
}: {
  item: InboxItem;
  active: boolean;
  onClick: () => void;
  registerRef?: (el: HTMLLIElement | null) => void;
}) {
  const meta = sourceMeta(item);
  const SrcIcon = meta.icon;
  const isInflow = item.source === "bank_statement" && item.amount > 0 &&
    /chuyển khoản|tt|thanh toan|payment|transfer/i.test(item.title + " " + (item.subtitle ?? ""));
  const isOutflow = item.source === "bank_statement" && !isInflow;
  const sign = item.source === "bank_statement" ? (isOutflow ? "−" : "+") : "";

  return (
    <li
      ref={registerRef}
      onClick={onClick}
      className={cn(
        "group relative cursor-pointer overflow-hidden rounded-lg border bg-card transition",
        "before:absolute before:inset-y-0 before:left-0 before:w-1",
        bandRail(item.confidence_band),
        active
          ? "border-primary/40 bg-primary/[0.04] shadow-sm before:w-1.5 before:bg-primary"
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
            {active && (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" /> Đang chat
              </span>
            )}
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

/* ───────── Empty / Skeleton ─────────
 * Text chuẩn (dùng thống nhất toàn module Inbox):
 *   - Loading : "Đang tải hộp đến…"
 *   - Empty   : "Hộp đến đang trống" + "AI sẽ tự đưa hoá đơn, sao kê mới vào đây."
 *   - Tab WIP : "Đang hoàn thiện" + "Tính năng sẽ sớm có mặt."
 */
export const INBOX_COPY = {
  loading: "Đang tải hộp đến…",
  emptyTitle: "Hộp đến đang trống",
  emptyHint: "AI sẽ tự đưa hoá đơn, sao kê mới vào đây.",
  wipTitle: "Đang hoàn thiện",
  wipHint: "Tính năng sẽ sớm có mặt.",
} as const;

function EmptyInbox() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-10 text-center text-sm text-muted-foreground">
      <CheckCircle2 className="h-8 w-8 text-emerald-500/70" />
      <div className="font-medium text-foreground">{INBOX_COPY.emptyTitle}</div>
      <div className="text-xs">{INBOX_COPY.emptyHint}</div>
    </div>
  );
}

function EmptyTab({ label }: { label: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-1.5 p-10 text-center text-sm text-muted-foreground">
      <div className="font-medium text-foreground">{label}</div>
      <div className="text-xs">
        {INBOX_COPY.wipTitle} — {INBOX_COPY.wipHint.toLowerCase()}
      </div>
    </div>
  );
}


function ListSkeleton() {
  // Khớp bố cục thật của ItemCard: rail trái + 5 hàng có thể có (pill/meta, title+amount, memo, proposal pills, blocker/followup)
  const variants: Array<{
    rail: string;
    hasMemo?: boolean;
    proposalCount?: number;
    extra?: "blocker" | "followup" | null;
  }> = [
    { rail: "bg-emerald-500/40", proposalCount: 3, extra: null },        // invoice tin cậy cao
    { rail: "bg-amber-500/40", hasMemo: true, proposalCount: 2, extra: "followup" }, // bank statement medium
    { rail: "bg-emerald-500/40", proposalCount: 4, extra: null },        // einvoice high
    { rail: "bg-rose-500/40", extra: "blocker" },                        // blocker (không có proposal)
    { rail: "bg-amber-500/40", hasMemo: true, proposalCount: 2, extra: null }, // bank statement
  ];

  return (
    <ul
      className="space-y-3 p-4"
      role="status"
      aria-live="polite"
      aria-label={INBOX_COPY.loading}
    >

      {variants.map((v, i) => (
        <li
          key={i}
          className="skeleton-card rounded-lg border border-border/50 bg-card"
        >
          {/* rail */}
          <span className={cn("absolute inset-y-0 left-0 w-1", v.rail)} />
          <div className="pl-4 pr-4 py-3">
            {/* Row 1: pill + thời gian + dot */}
            <div className="flex items-center gap-2">
              <div className="skeleton-block h-4 w-20" />
              <div className="skeleton-block h-3 w-12" />
              <div className="skeleton-block h-3 w-24 hidden sm:block" />
              <div className="skeleton-block ml-auto h-2 w-2 rounded-full" />
            </div>

            {/* Row 2: title + amount */}
            <div className="mt-2 flex items-baseline justify-between gap-3">
              <div className="skeleton-block h-4 w-2/3" />
              <div className="skeleton-block h-4 w-24 shrink-0" />
            </div>

            {/* Row 3: memo */}
            {v.hasMemo && <div className="skeleton-block mt-1.5 h-3 w-3/4" />}

            {/* Row 4: proposal pills */}
            {v.proposalCount ? (
              <div className="mt-2 inline-flex flex-wrap gap-1.5 rounded-md bg-muted/30 px-2 py-1.5">
                {Array.from({ length: v.proposalCount }).map((_, j) => (
                  <div key={j} className="skeleton-block h-3 w-20" />
                ))}
              </div>
            ) : null}

            {/* Row 5: blocker / followup */}
            {v.extra === "blocker" && (
              <div className="skeleton-block mt-2 h-7 w-full border border-rose-500/20 bg-rose-500/5" />
            )}
            {v.extra === "followup" && (
              <div className="skeleton-block mt-2 h-7 w-5/6 border border-amber-500/20 bg-amber-500/5" />
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}


/* ───────── Mobile Inbox overlay with swipe-right / pull-down to close ───────── */
function MobileInboxOverlay({
  onClose,
  children,
}: {
  onClose: () => void;
  children: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const start = useRef<{ x: number; y: number; t: number } | null>(null);
  const [drag, setDrag] = useState<{ dx: number; dy: number } | null>(null);

  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    start.current = { x: t.clientX, y: t.clientY, t: Date.now() };
    setDrag({ dx: 0, dy: 0 });
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (!start.current) return;
    const t = e.touches[0];
    const dx = Math.max(0, t.clientX - start.current.x);
    const dy = Math.max(0, t.clientY - start.current.y);
    setDrag({ dx, dy });
  };
  const onTouchEnd = () => {
    if (!start.current || !drag) {
      start.current = null;
      setDrag(null);
      return;
    }
    const elapsed = Date.now() - start.current.t;
    const velocity = Math.max(drag.dx, drag.dy) / Math.max(1, elapsed);
    const shouldClose =
      drag.dx > 120 || drag.dy > 140 || (velocity > 0.5 && (drag.dx > 50 || drag.dy > 50));
    start.current = null;
    setDrag(null);
    if (shouldClose) onClose();
  };

  const tx = drag ? Math.max(drag.dx, 0) : 0;
  const ty = drag ? Math.max(drag.dy, 0) : 0;
  const dragging = !!drag && (tx > 2 || ty > 2);

  return (
    <div className="fixed inset-x-0 top-0 bottom-[88px] z-40 flex lg:hidden">
      <div
        ref={panelRef}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
        style={{
          transform: dragging ? `translate(${tx}px, ${ty}px)` : undefined,
          transition: dragging ? "none" : "transform 200ms ease-out",
          touchAction: "pan-y",
        }}
        className="flex h-full w-[92vw] max-w-md flex-col overflow-hidden rounded-br-2xl bg-background shadow-2xl ring-1 ring-border/40"
      >
        {children}
      </div>
      <div className="flex-1 bg-background/60" onClick={onClose} />
    </div>
  );
}

