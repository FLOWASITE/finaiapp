import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import type React from "react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";

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
  LogOut,
  Settings,
  RefreshCw,
  Keyboard,
  Home,
  Calculator,
  Eye,
  Archive,
  MinusCircle,
  PanelRightClose,
  PanelRightOpen,
  Zap,
} from "lucide-react";

import { useInboxDockHidden } from "@/hooks/use-inbox-dock-hidden";
import { useWorkspace } from "@/hooks/use-workspace";
import mascotSrc from "@/assets/fin-mascot.png";

import {
  listInboxAi,
  approveInboxItem,
  skipInboxItem,
  saveInboxRule,
} from "@/lib/inbox-ai.functions";
import { getAutoPostSettings } from "@/lib/auto-post-settings.functions";
import { AutoPostAuditSheet } from "@/components/inbox/auto-post-audit-sheet";
import { getDocument } from "@/lib/documents.functions";

import type { InboxItem, ConfidenceBand, VoucherKind } from "@/lib/ai/inbox-types";
import { mockInboxItems, mockInboxStats } from "@/data/mockInbox";
import { Button } from "@/components/ui/button";
import { openAskAi } from "@/lib/open-ask-ai";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { EmptyState } from "@/components/ui/empty-state";
import { InboxItemSheet, InboxItemDetail } from "@/components/inbox/inbox-item-sheet";
import { InvoiceFileViewer } from "@/components/invoice-viewer/invoice-file-viewer";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { TenantSwitcher } from "@/components/tenant-switcher";
import { useCurrentUser } from "@/hooks/use-current-user";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const tabSchema = z.object({
  tab: fallback(z.enum(["inbox", "posted", "review", "documents", "reports"]), "inbox").default("inbox"),
});

export const Route = createFileRoute("/_app/inbox")({
  validateSearch: zodValidator(tabSchema),
  component: InboxAiPage,
  head: () => ({
    meta: [{ title: "Inbox · FinAI" }],
  }),
});

const TABS: Array<{ key: "inbox" | "posted" | "review" | "documents" | "reports"; label: string }> = [
  { key: "inbox", label: "Inbox AI" },
  { key: "posted", label: "Đã ghi sổ" },
  { key: "review", label: "Cần xem lại" },
  { key: "documents", label: "Tài liệu" },
  { key: "reports", label: "Báo cáo" },
];

const VND = (n: number) => (Math.round(n) || 0).toLocaleString("vi-VN");

function sourceMeta(it: InboxItem): { icon: any; label: string } {
  if (it.source === "bank_statement") return { icon: Landmark, label: it.source_short || "Sao kê" };
  if (it.source === "ai_insight") return { icon: Lightbulb, label: it.source_short || "AI phát hiện" };
  const short = it.source_short?.trim();
  const label = short && !/^doc$/i.test(short) ? short : "Hoá đơn vào";
  return { icon: FileText, label };
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

function voucherKindMeta(kind?: VoucherKind): { label: string; cls: string } | null {
  switch (kind) {
    case "purchase_invoice":
      return { label: "Hóa đơn vào", cls: "bg-orange-500/10 text-orange-700 border-orange-500/30 dark:text-orange-300" };
    case "sales_invoice":
      return { label: "Hóa đơn ra", cls: "bg-sky-500/10 text-sky-700 border-sky-500/30 dark:text-sky-300" };
    case "bank_receipt":
    case "bank_payment":
      return { label: "Giao dịch bank", cls: "bg-indigo-500/10 text-indigo-700 border-indigo-500/30 dark:text-indigo-300" };
    case "cash_receipt":
    case "cash_payment":
      return { label: "Thu/Chi tiền mặt", cls: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-300" };
    case "ai_insight":
      return { label: "AI phát hiện", cls: "bg-violet-500/10 text-violet-700 border-violet-500/30 dark:text-violet-300" };
    default:
      return null;
  }
}

type ProcStatus =
  | "ocr_pending"
  | "ocr_failed"
  | "blocked"
  | "needs_review"
  | "ready"
  | "auto_ready"
  | "posted"
  | "skipped";

const STATUS_META: Record<
  ProcStatus,
  { label: string; icon: typeof CheckCircle2; cls: string; spin?: boolean }
> = {
  ocr_pending: {
    label: "Đang đọc OCR",
    icon: Loader2,
    cls: "bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-300",
    spin: true,
  },
  ocr_failed: {
    label: "Lỗi OCR",
    icon: AlertTriangle,
    cls: "bg-rose-500/10 text-rose-700 border-rose-500/30 dark:text-rose-300",
  },
  blocked: {
    label: "Bị chặn",
    icon: AlertTriangle,
    cls: "bg-rose-500/10 text-rose-700 border-rose-500/30 dark:text-rose-300",
  },
  needs_review: {
    label: "Cần xem lại",
    icon: Eye,
    cls: "bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-300",
  },
  ready: {
    label: "Sẵn sàng duyệt",
    icon: CheckCircle2,
    cls: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-300",
  },
  auto_ready: {
    label: "AI gợi ý duyệt",
    icon: Sparkles,
    cls: "bg-indigo-500/10 text-indigo-700 border-indigo-500/30 dark:text-indigo-300",
  },
  posted: {
    label: "Đã ghi sổ",
    icon: Archive,
    cls: "bg-slate-500/10 text-slate-700 border-slate-500/30 dark:text-slate-300",
  },
  skipped: {
    label: "Đã bỏ qua",
    icon: MinusCircle,
    cls: "bg-muted text-muted-foreground border-border",
  },
};

function StatusBadge({ status }: { status: ProcStatus }) {
  const m = STATUS_META[status];
  const Icon = m.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium",
        m.cls,
      )}
    >
      <Icon className={cn("h-2.5 w-2.5", m.spin && "animate-spin")} />
      {m.label}
    </span>
  );
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
  const { tab } = Route.useSearch();
  const navigate = useNavigate({ from: "/inbox" });
  const setTab = useCallback(
    (next: (typeof TABS)[number]["key"]) => {
      navigate({ search: (prev: { tab?: string }) => ({ ...prev, tab: next }), replace: false });
    },
    [navigate],
  );
  const [sheetItem, setSheetItem] = useState<InboxItem | null>(null);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [autoPostSheetOpen, setAutoPostSheetOpen] = useState(false);

  const autoPostFn = useServerFn(getAutoPostSettings);
  const { data: autoPostSettings } = useQuery({
    queryKey: ["auto-post-settings"],
    queryFn: () => autoPostFn(),
    staleTime: 60_000,
  });

  
  const listRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Map<string, HTMLLIElement>>(new Map());
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
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    placeholderData: (prev) => prev,
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

  // ───── Filters: posted / kind / voucher number ─────
  const [filterPosted, setFilterPosted] = useState<"all" | "posted" | "open">("all");
  const [filterKind, setFilterKind] = useState<"all" | "sales" | "purchase">("all");
  const [filterQ, setFilterQ] = useState("");
  const [sortBy, setSortBy] = useState<"recent" | "amount" | "confidence">("recent");

  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia("(min-width: 1024px)");
    const onChange = () => setIsDesktop(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  const filteredItems = useMemo(() => {
    const q = filterQ.trim().toLowerCase();
    const arr = items.filter((it) => {
      if (filterPosted === "posted" && it.processing_status !== "posted") return false;
      if (filterPosted === "open" && it.processing_status === "posted") return false;
      if (filterKind !== "all") {
        const k = it.proposal.voucher_kind;
        const pv = it.posted_voucher?.kind;
        const isSales = k === "sales_invoice" || pv === "sales_voucher";
        const isPurchase = k === "purchase_invoice" || pv === "purchase_voucher";
        if (filterKind === "sales" && !isSales) return false;
        if (filterKind === "purchase" && !isPurchase) return false;
      }
      if (q) {
        const vno = it.posted_voucher?.voucher_no?.toLowerCase() ?? "";
        const ino = String(it.proposal.meta?.invoice_no ?? "").toLowerCase();
        const title = it.title.toLowerCase();
        if (!vno.includes(q) && !ino.includes(q) && !title.includes(q)) return false;
      }
      return true;
    });
    const sorted = [...arr];
    if (sortBy === "amount") {
      sorted.sort((a, b) => Math.abs(b.amount || 0) - Math.abs(a.amount || 0));
    } else if (sortBy === "confidence") {
      sorted.sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0));
    } else {
      sorted.sort(
        (a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime(),
      );
    }
    return sorted;
  }, [items, filterPosted, filterKind, filterQ, sortBy]);

  const activeId = sheetItem?.id ?? null;

  // Desktop: auto-select first item when none selected
  useEffect(() => {
    if (!isDesktop) return;
    if (!sheetItem && filteredItems.length > 0) {
      setSheetItem(filteredItems[0]);
    }
  }, [isDesktop, filteredItems, sheetItem]);





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
          purchase_purpose: it.purchase_purpose,
        },
      }),
    onSuccess: (resp: any, it) => {
      // Refresh tất cả các danh sách bị ảnh hưởng
      qc.invalidateQueries({ queryKey: ["inbox-ai"] });
      qc.invalidateQueries({ queryKey: ["sales-invoices"] });
      qc.invalidateQueries({ queryKey: ["sales-vouchers"] });
      qc.invalidateQueries({ queryKey: ["sales-dashboard"] });
      qc.invalidateQueries({ queryKey: ["purchase-vouchers"] });
      qc.invalidateQueries({ queryKey: ["documents"] });
      qc.invalidateQueries({ queryKey: ["journal"] });
      qc.invalidateQueries({ queryKey: ["dashboard-overview"] });
      const postedVoucher = resp?.posted_voucher ?? undefined;
      // Đánh dấu card vừa duyệt là "posted" + gắn phiếu vừa tạo
      qc.setQueryData(["inbox-ai", tab], (old: any) => {
        if (!old?.items) return old;
        return {
          ...old,
          items: old.items.map((x: InboxItem) =>
            x.id === it.id
              ? { ...x, processing_status: "posted", posted_voucher: postedVoucher ?? x.posted_voucher }
              : x,
          ),
        };
      });
      // Cập nhật luôn item đang mở trong sheet để hiển thị nút "Xem phiếu"
      setSheetItem((cur) =>
        cur && cur.id === it.id
          ? { ...cur, processing_status: "posted", posted_voucher: postedVoucher ?? cur.posted_voucher }
          : cur,
      );
    },
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

  const handleCardClick = useCallback(
    (id: string) => {
      const it = items.find((x) => x.id === id);
      if (it) setSheetItem(it);
    },
    [items],
  );

  const handleApproveItem = useCallback(
    (it: InboxItem) => {
      if (isMock(it)) {
        dismissMock(it.id);
        toast.success(`Đã ghi sổ: ${it.title}`);
        return;
      }
      approveM.mutate(it, {
        onSuccess: (resp: any) => {
          if (resp?.already_posted) {
            toast.info(resp.message || `Hóa đơn đã được ghi sổ trước đó.`);
          } else {
            toast.success(`Đã ghi sổ: ${it.title}`);
          }
        },
        onError: (e: any) => toast.error(e?.message || "Không ghi sổ được"),
      });
    },
    [approveM],
  );

  const handleSkipItem = useCallback(
    (it: InboxItem) => {
      if (isMock(it)) {
        dismissMock(it.id);
        toast(`Đã bỏ qua: ${it.title}`);
        setSheetItem(null);
        return;
      }
      skipM.mutate(it, {
        onSuccess: () => {
          toast(`Đã bỏ qua: ${it.title}`);
          setSheetItem(null);
        },
      });
    },
    [skipM],
  );

  const handleRuleItem = useCallback(
    (it: InboxItem) => {
      if (isMock(it)) {
        toast.success(`AI sẽ nhớ quy tắc cho các mục giống "${it.partner || it.title}"`);
        return;
      }
      ruleM.mutate(it, {
        onSuccess: () =>
          toast.success(`AI sẽ nhớ quy tắc cho "${it.partner || it.title}"`),
      });
    },
    [ruleM],
  );

  const handleEditItem = useCallback((it: InboxItem) => {
    openAskAi(`Sửa đề xuất "${it.title}": `);
  }, []);

  /* ───── Bulk approve with toast progress ───── */
  const [confirmBulkOpen, setConfirmBulkOpen] = useState(false);

  const highTargets = useMemo(
    () => items.filter((i) => i.confidence_band === "high" && !i.blocker),
    [items],
  );
  const bulkSumAbs = useMemo(
    () => highTargets.reduce((s, i) => s + Math.abs(i.amount || 0), 0),
    [highTargets],
  );

  const requestApproveAllHigh = useCallback(() => {
    if (!highTargets.length) {
      toast("Không có mục tin cậy cao nào để duyệt");
      return;
    }
    setConfirmBulkOpen(true);
  }, [highTargets.length]);

  const runApproveAllHigh = useCallback(async () => {
    const targets = highTargets;
    if (!targets.length) return;
    const tId = toast.loading(`Đang duyệt 0/${targets.length} mục…`);
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
        toast.loading(`Đang duyệt ${ok}/${targets.length} mục…`, { id: tId });
        await new Promise((r) => setTimeout(r, 80));
      } catch {}
    }
    toast.success(`Đã duyệt ${ok}/${targets.length} mục`, { id: tId });
  }, [highTargets, approveM]);

  // If context item disappears (was approved/skipped externally), auto close sheet
  useEffect(() => {
    if (activeId && !items.find((i) => i.id === activeId)) {
      setSheetItem(null);
    }
  }, [items, activeId]);


  return (
    <div className="flex h-screen w-full flex-col bg-gradient-to-b from-background via-background to-muted/10">
      {/* Top header */}
      <InboxHeader
        onOpenCmd={() => setCmdOpen(true)}
        periodLabel={periodLabel()}
        autoPostEnabled={!!autoPostSettings?.enabled}
        autoPostMinConfidence={autoPostSettings?.min_confidence ?? 0.95}
        autoPostMaxAmount={autoPostSettings?.max_amount ?? 5_000_000}
        onOpenAutoPostSheet={() => setAutoPostSheetOpen(true)}
      />


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
        {autoPostSettings?.enabled && (
          <>
            <Divider />
            <button
              type="button"
              onClick={() => setAutoPostSheetOpen(true)}
              className="text-left rounded-md -mx-1 px-1 transition hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              title="Xem chi tiết bút toán Fin tự duyệt 7 ngày qua"
            >
              <Stat
                label="Fin tự duyệt 7 ngày"
                value="Xem"
                extra={
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                    <Zap className="h-2.5 w-2.5" /> audit
                  </span>
                }
              />
            </button>
          </>
        )}


        <div className="ml-auto">
          <Button
            variant="outline"
            onClick={requestApproveAllHigh}
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

      {/* Body — Desktop: 3-column layout (list | invoice | detail) */}
      <div className="hidden min-h-0 flex-1 overflow-hidden lg:grid lg:grid-cols-[1.2fr_1.8fr_1.2fr]">
        {/* Left: list */}
        <div className="flex min-h-0 flex-col border-r border-border/40">
          <div className="shrink-0 border-b border-border/40 p-3">
            <FilterBar
              posted={filterPosted}
              onPosted={setFilterPosted}
              kind={filterKind}
              onKind={setFilterKind}
              q={filterQ}
              onQ={setFilterQ}
              sortBy={sortBy}
              onSortBy={setSortBy}
              total={items.length}
              shown={filteredItems.length}
            />
          </div>
          <div ref={listRef} className="relative min-h-0 flex-1 overflow-y-auto">
            {tab === "reports" || tab === "documents" || tab === "posted" || tab === "review" ? (
              <EmptyTab label={TABS.find((t) => t.key === tab)!.label} />
            ) : isLoading ? (
              <ListSkeleton />
            ) : items.length === 0 ? (
              <EmptyInbox />
            ) : (
              <>
                <ul className="space-y-2.5 p-3">
                  {filteredItems.map((it) => (
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
                  {filteredItems.length === 0 && (
                    <li className="rounded-xl border border-dashed border-border/60 p-6 text-center text-sm text-muted-foreground">
                      Không có mục nào khớp bộ lọc.
                    </li>
                  )}
                </ul>
                {stats && stats.pending > items.length && (
                  <div className="px-3 pb-4">
                    <div className="inline-flex items-center rounded-full bg-muted/60 px-3 py-1 text-[11px] text-muted-foreground">
                      + {stats.pending - items.length} mục khác
                    </div>
                  </div>
                )}
              </>
            )}
            {showScrollDown && (
              <button
                type="button"
                onClick={() =>
                  listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" })
                }
                className="absolute bottom-4 right-4 flex h-9 w-9 items-center justify-center rounded-full border border-border bg-background shadow-lg transition hover:bg-muted"
                aria-label="Cuộn xuống"
              >
                <ArrowDown className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* Middle: invoice viewer */}
        <div className="flex min-h-0 flex-col overflow-hidden border-r border-border/40 bg-muted/10">
          {sheetItem ? (
            <InboxInvoicePane item={sheetItem} />
          ) : (
            <div className="flex h-full items-center justify-center p-8">
              <EmptyState
                mood="thinking"
                title="Chọn một mục bên trái"
                description="Hoá đơn / chứng từ sẽ hiển thị ở đây."
                bordered={false}
              />
            </div>
          )}
        </div>

        {/* Right: detail / proposal */}
        <div className="flex min-h-0 flex-col overflow-hidden bg-background">
          {sheetItem ? (
            <InboxItemDetail
              item={sheetItem}
              onApprove={handleApproveItem}
              onSkip={handleSkipItem}
              onRule={handleRuleItem}
              onEdit={handleEditItem}
              approving={approveM.isPending}
            />
          ) : (
            <div className="flex h-full items-center justify-center p-8">
              <EmptyState
                mood="happy"
                title="Đề xuất của Fin sẽ hiện ở đây"
                description="Chọn một mục để xem bút toán đề xuất và duyệt nhanh."
                bordered={false}
              />
            </div>
          )}
        </div>
      </div>

      {/* Mobile: danh sách theo tab */}
      <div className="block min-h-0 flex-1 overflow-hidden lg:hidden">
        {tab === "inbox" ? (
          <div className="h-full overflow-y-auto">
            {isLoading ? (
              <ListSkeleton />
            ) : items.length === 0 ? (
              <EmptyInbox />
            ) : (
              <>
                <div className="p-4 pb-0">
                  <FilterBar
                    posted={filterPosted}
                    onPosted={setFilterPosted}
                    kind={filterKind}
                    onKind={setFilterKind}
                    q={filterQ}
                    onQ={setFilterQ}
                    sortBy={sortBy}
                    onSortBy={setSortBy}
                    total={items.length}
                    shown={filteredItems.length}
                  />
                </div>
                <ul className="space-y-3 p-4">
                  {filteredItems.map((it) => (
                    <ItemCard
                      key={it.id}
                      item={it}
                      active={activeId === it.id}
                      onClick={() => handleCardClick(it.id)}
                      registerRef={() => {}}
                    />
                  ))}
                  {filteredItems.length === 0 && (
                    <li className="rounded-xl border border-dashed border-border/60 p-6 text-center text-sm text-muted-foreground">
                      Không có mục nào khớp bộ lọc.
                    </li>
                  )}
                  {stats && stats.pending > items.length && (
                    <li className="pt-1 text-center text-[11px] text-muted-foreground">
                      + {stats.pending - items.length} mục khác
                    </li>
                  )}
                </ul>
              </>
            )}

          </div>
        ) : (
          <div className="h-full overflow-y-auto">
            <EmptyTab label={TABS.find((t) => t.key === tab)!.label} />
          </div>
        )}
      </div>

      {/* Sheet chi tiết item — chỉ mobile/tablet */}
      {!isDesktop && (
        <InboxItemSheet
          item={sheetItem}
          onClose={() => setSheetItem(null)}
          onApprove={handleApproveItem}
          onSkip={handleSkipItem}
          onRule={handleRuleItem}
          onEdit={handleEditItem}
          approving={approveM.isPending}
        />
      )}





      <AlertDialog open={confirmBulkOpen} onOpenChange={setConfirmBulkOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Duyệt nhanh {highTargets.length} mục tin cậy cao?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm">
                <div>
                  Tổng giá trị tuyệt đối:{" "}
                  <span className="font-semibold text-foreground">
                    {VND(bulkSumAbs)} ₫
                  </span>
                </div>
                <ul className="space-y-1 rounded-md border border-border/60 bg-muted/30 p-2.5 text-xs">
                  {highTargets.slice(0, 3).map((it) => (
                    <li key={it.id} className="flex items-baseline justify-between gap-3">
                      <span className="truncate">
                        <span className="text-foreground">{it.title}</span>
                        {it.partner && (
                          <span className="text-muted-foreground"> · {it.partner}</span>
                        )}
                      </span>
                      <span className="shrink-0 font-mono text-foreground">
                        {VND(it.amount)} ₫
                      </span>
                    </li>
                  ))}
                  {highTargets.length > 3 && (
                    <li className="text-muted-foreground">
                      …và {highTargets.length - 3} mục khác
                    </li>
                  )}
                </ul>
                <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-2 text-xs text-amber-700 dark:text-amber-300">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>Hành động này sẽ tạo bút toán và không thể hoàn tác nhanh.</span>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Để xem lại</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmBulkOpen(false);
                void runApproveAllHigh();
              }}
              className="bg-emerald-600 text-white hover:bg-emerald-600/90"
            >
              Duyệt {highTargets.length} mục
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {cmdOpen && <CommandBar onClose={() => setCmdOpen(false)} />}
    </div>
  );
}


/* ───────── Header ───────── */
function InboxHeader({
  onOpenCmd,
  periodLabel,
}: {
  onOpenCmd: () => void;
  periodLabel: string;
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: me } = useCurrentUser();
  const { workspace, setWorkspace } = useWorkspace();

  const initial =
    (me?.profile?.display_name || me?.email || "?").trim().charAt(0).toUpperCase() || "?";
  const displayName = me?.profile?.display_name || me?.email || "Tài khoản";

  const onSignOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/login" });
  };

  const switchToAccounting = () => {
    setWorkspace("back");
    navigate({ to: "/dashboard" });
  };

  return (
    <header className="relative mx-3 mt-3 mb-2 flex h-14 shrink-0 items-center gap-2 overflow-hidden rounded-2xl border border-border/40 bg-gradient-to-r from-background/80 via-background/70 to-emerald-500/[0.04] px-3 shadow-lg shadow-emerald-500/10 backdrop-blur-xl supports-[backdrop-filter]:bg-background/50 before:pointer-events-none before:absolute before:inset-0 before:bg-[radial-gradient(ellipse_at_left,oklch(0.72_0.16_162/0.08),transparent_60%)]">
      <Link
        to="/dashboard"
        className="relative flex h-8 w-8 items-center justify-center rounded-lg border border-border/40 text-muted-foreground transition hover:bg-muted/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        title="Quay lại"
      >
        <ArrowLeft className="h-4 w-4" />
      </Link>
      <Link
        to="/dashboard"
        className="relative group flex items-center gap-2 rounded-xl px-1.5 py-1 transition hover:bg-primary/5"
        title="Trang chủ FinAI"
      >
        <span className="pointer-events-none absolute inset-0 -z-10 rounded-xl bg-gradient-to-r from-primary/20 to-cyan-400/10 opacity-0 blur-md transition group-hover:opacity-100" />
        <img
          src={mascotSrc}
          alt="FinAI Mascot"
          draggable={false}
          className="h-9 w-9 shrink-0 object-contain drop-shadow-[0_2px_8px_oklch(0.72_0.16_162/0.45)] transition-transform group-hover:scale-105"
        />
      </Link>

      {/* Mode switcher: AI ↔ Kế toán */}
      <div
        role="tablist"
        aria-label="Chế độ làm việc"
        className="ml-2 hidden items-center gap-0.5 rounded-lg border border-border/40 bg-muted/30 p-0.5 sm:flex"
      >
        <button
          type="button"
          role="tab"
          aria-selected={workspace === "front"}
          title="Chế độ AI — gợi ý & duyệt nhanh"
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium transition",
            workspace === "front"
              ? "bg-foreground text-background shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
          onClick={() => setWorkspace("front")}
        >
          <Sparkles className="h-3 w-3" /> AI
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={workspace === "back"}
          title="Chế độ Kế toán đầy đủ — sổ sách, bút toán"
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium transition",
            workspace === "back"
              ? "bg-foreground text-background shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
          onClick={switchToAccounting}
        >
          <Calculator className="h-3 w-3" /> Kế toán
        </button>
      </div>

      <Separator orientation="vertical" className="ml-1 hidden h-6 md:block" />

      <button
        type="button"
        onClick={onOpenCmd}
        className="ml-2 hidden h-9 max-w-md flex-1 items-center gap-2 rounded-lg border border-border/50 bg-card/50 px-3 text-left text-sm text-muted-foreground transition hover:border-primary/40 hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 md:flex"
      >
        <Sparkles className="h-3.5 w-3.5 text-primary" />
        <span className="flex-1 truncate">
          <span className="hidden lg:inline">
            Hỏi AI: "Chi phí marketing tháng này?", "Đối chiếu HĐ với sao kê"…
          </span>
          <span className="lg:hidden">Hỏi AI…</span>
        </span>
        <kbd className="hidden rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] sm:inline">⌘K</kbd>
      </button>

      <div className="ml-auto flex items-center gap-2">
        <InboxDockToggle />

        <div className="hidden items-center gap-1.5 rounded-lg border border-border/40 px-2.5 py-1.5 text-xs text-foreground/70 md:flex">
          <Calendar className="h-3.5 w-3.5" />
          {periodLabel}
        </div>

        <div className="hidden md:block">
          <TenantSwitcher />
        </div>

        <Separator orientation="vertical" className="hidden h-6 md:block" />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="flex items-center gap-2 rounded-full border border-border/40 p-0.5 pr-2 transition hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              aria-label="Tài khoản"
            >
              <Avatar className="h-7 w-7">
                {me?.profile?.avatar_url ? (
                  <AvatarImage src={me.profile.avatar_url} alt={displayName} />
                ) : null}
                <AvatarFallback className="bg-primary/15 text-[11px] font-semibold text-primary">
                  {initial}
                </AvatarFallback>
              </Avatar>
              <span className="hidden max-w-[120px] truncate text-xs font-medium text-foreground/80 lg:inline">
                {displayName}
              </span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuLabel className="flex flex-col gap-0.5">
              <span className="truncate text-sm">{displayName}</span>
              {me?.email && me.email !== displayName && (
                <span className="truncate text-[11px] font-normal text-muted-foreground">
                  {me.email}
                </span>
              )}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate({ to: "/settings" })}>
              <Settings className="mr-2 h-4 w-4" /> Cài đặt
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onOpenCmd}>
              <Keyboard className="mr-2 h-4 w-4" /> Trợ giúp & phím tắt
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onSignOut} className="text-destructive focus:text-destructive">
              <LogOut className="mr-2 h-4 w-4" /> Đăng xuất
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-border/40 text-muted-foreground transition hover:bg-muted/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              aria-label="Thêm tuỳ chọn"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem
              onClick={() => {
                qc.invalidateQueries({ queryKey: ["inbox-ai"] });
                toast.success("Đang làm mới Inbox AI…");
              }}
            >
              <RefreshCw className="mr-2 h-4 w-4" /> Làm mới dữ liệu
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                // TODO: mở dialog đổi kỳ kế toán khi có
                toast("Đổi kỳ kế toán — đang phát triển");
              }}
            >
              <Calendar className="mr-2 h-4 w-4" /> Đổi kỳ kế toán
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onOpenCmd}>
              <Keyboard className="mr-2 h-4 w-4" /> Mở bảng phím tắt
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate({ to: "/dashboard" })}>
              <Home className="mr-2 h-4 w-4" /> Về Dashboard
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

/* ───────── Stats ───────── */
function InboxDockToggle() {
  const { hidden, toggle } = useInboxDockHidden();
  return (
    <button
      type="button"
      onClick={toggle}
      title={hidden ? "Hiện thanh trợ lý AI" : "Ẩn thanh trợ lý AI"}
      aria-label={hidden ? "Hiện thanh trợ lý AI" : "Ẩn thanh trợ lý AI"}
      className={cn(
        "hidden h-9 items-center gap-1.5 rounded-lg border px-2.5 text-[11px] font-medium transition md:inline-flex",
        hidden
          ? "border-border/40 bg-muted/30 text-muted-foreground hover:bg-muted/60 hover:text-foreground"
          : "border-primary/30 bg-primary/10 text-primary hover:bg-primary/15",
      )}
    >
      {hidden ? <PanelRightOpen className="h-3.5 w-3.5" /> : <PanelRightClose className="h-3.5 w-3.5" />}
      <span className="hidden lg:inline">{hidden ? "Mở AI" : "Ẩn AI"}</span>
    </button>
  );
}

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
function formatDateVi(s?: string | number | null) {
  if (!s) return null;
  const str = String(s);
  const m = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  const m2 = str.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (m2) return str.slice(0, 10);
  return null;
}

function FilterBar({
  posted,
  onPosted,
  kind,
  onKind,
  q,
  onQ,
  sortBy,
  onSortBy,
  total,
  shown,
}: {
  posted: "all" | "posted" | "open";
  onPosted: (v: "all" | "posted" | "open") => void;
  kind: "all" | "sales" | "purchase";
  onKind: (v: "all" | "sales" | "purchase") => void;
  q: string;
  onQ: (v: string) => void;
  sortBy: "recent" | "amount" | "confidence";
  onSortBy: (v: "recent" | "amount" | "confidence") => void;
  total: number;
  shown: number;
}) {
  const Seg = <T extends string>(props: {
    value: T;
    current: T;
    onClick: (v: T) => void;
    label: string;
  }) => (
    <button
      type="button"
      onClick={() => props.onClick(props.value)}
      className={cn(
        "rounded-full px-2.5 py-1 text-[11px] font-medium transition",
        props.current === props.value
          ? "bg-foreground text-background shadow-sm"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {props.label}
    </button>
  );
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <div className="flex items-center gap-0.5 rounded-full border border-border/40 bg-muted/30 p-0.5">
        <Seg value="all" current={posted} onClick={onPosted} label="Tất cả" />
        <Seg value="posted" current={posted} onClick={onPosted} label="Đã ghi sổ" />
        <Seg value="open" current={posted} onClick={onPosted} label="Chưa ghi" />
      </div>
      <div className="flex items-center gap-0.5 rounded-full border border-border/40 bg-muted/30 p-0.5">
        <Seg value="all" current={kind} onClick={onKind} label="Mọi loại" />
        <Seg value="sales" current={kind} onClick={onKind} label="Bán" />
        <Seg value="purchase" current={kind} onClick={onKind} label="Mua" />
      </div>
      <div className="flex items-center gap-0.5 rounded-full border border-border/40 bg-muted/30 p-0.5">
        <Seg value="recent" current={sortBy} onClick={onSortBy} label="Mới nhất" />
        <Seg value="amount" current={sortBy} onClick={onSortBy} label="Số tiền" />
        <Seg value="confidence" current={sortBy} onClick={onSortBy} label="Tin cậy" />
      </div>
      <div className="ml-auto flex items-center gap-2">
        <input
          value={q}
          onChange={(e) => onQ(e.target.value)}
          placeholder="Số phiếu (BH/PX) hoặc số HĐ…"
          className="h-7 w-56 rounded-md border border-border/50 bg-background px-2 text-[12px] placeholder:text-muted-foreground/60 focus:border-primary/50 focus:outline-none"
        />
        <span className="text-[11px] tabular-nums text-muted-foreground">
          {shown}/{total}
        </span>
      </div>
    </div>
  );
}

function InboxInvoicePane({ item }: { item: InboxItem }) {
  const isDoc = item.source === "document";
  const getDocumentFn = useServerFn(getDocument);
  const q = useQuery({
    queryKey: ["inbox-doc-viewer", item.external_id],
    queryFn: () => getDocumentFn({ data: { id: item.external_id } }),
    enabled: isDoc,
    staleTime: 60_000,
  });

  if (!isDoc) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <EmptyState
          mood="thinking"
          title="Không có file đính kèm"
          description="Mục này đến từ sao kê hoặc cảnh báo AI — không có file để xem."
          bordered={false}
        />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/40 px-4 py-2.5">
        <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
          <FileText className="h-3.5 w-3.5" />
          {item.proposal.voucher_kind === "sales_invoice" ? "Hoá đơn ra" : "Hoá đơn mua"}
        </div>
        <span className="truncate text-[11px] text-muted-foreground">
          {q.data?.doc?.original_filename ?? ""}
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-4">
        {q.isLoading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : q.isError ? (
          <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-4 text-sm text-rose-700 dark:text-rose-300">
            Không tải được hoá đơn: {(q.error as any)?.message ?? "lỗi không xác định"}
          </div>
        ) : (
          <InvoiceFileViewer
            einvoice={(q.data?.doc?.ocr_extracted as any)?._einvoice ?? null}
            signedUrl={q.data?.signedUrl ?? null}
            mimeType={q.data?.doc?.mime_type ?? null}
            filename={q.data?.doc?.original_filename ?? null}
          />
        )}
      </div>
    </div>
  );
}


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
  const kindMeta = voucherKindMeta(item.proposal.voucher_kind);
  const SrcIcon = meta.icon;
  const isInflow = item.source === "bank_statement" && item.amount > 0 &&
    /chuyển khoản|tt|thanh toan|payment|transfer/i.test(item.title + " " + (item.subtitle ?? ""));
  const isOutflow = item.source === "bank_statement" && !isInflow;
  const sign = item.source === "bank_statement" ? (isOutflow ? "−" : "+") : "";

  const invoiceNo = item.proposal.meta?.invoice_no
    ? String(item.proposal.meta.invoice_no)
    : null;
  const invoiceDate = formatDateVi(item.proposal.meta?.invoice_date as any);
  const items = item.proposal.items ?? [];
  const firstItem = items[0]?.name;
  const moreItems = items.length > 1 ? items.length - 1 : 0;
  // Visual cue: AI item resolution coverage
  const resolvable = items.filter((i) => i.resolution && i.resolution.status !== "none");
  const matched = items.filter(
    (i) => i.resolution?.status === "auto" || (i.product_id && i.resolution?.status !== "new"),
  ).length;
  const needsReview = items.filter((i) => i.resolution?.status === "review").length;
  const isNew = items.filter((i) => i.resolution?.status === "new").length;
  const showResBadge = resolvable.length > 0;

  return (
    <li
      ref={registerRef}
      onClick={onClick}
      className={cn(
        "group relative cursor-pointer overflow-hidden rounded-xl border bg-card shadow-sm transition-all",
        "hover:shadow-md hover:-translate-y-px",
        active
          ? "border-primary/40 bg-primary/[0.03] shadow-md ring-1 ring-primary/20"
          : "border-border/60 hover:border-border",
      )}
    >
      {/* Confidence rail (floating, rounded) */}
      <span
        className={cn(
          "pointer-events-none absolute left-1 top-3 bottom-3 w-1 rounded-full",
          bandDot(item.confidence_band),
        )}
      />

      <div className="pl-4 pr-4 py-2.5 flex flex-col gap-2">
        {/* Top meta row */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-[11px] min-w-0">
            <span className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 font-semibold uppercase tracking-wide text-muted-foreground">
              <SrcIcon className="h-3 w-3" />
              {meta.label}
            </span>
            {kindMeta && (
              <span className={cn("inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-medium tracking-wide", kindMeta.cls)}>
                {kindMeta.label}
              </span>
            )}
            <span className="text-muted-foreground/80">{relTime(item.occurred_at)}</span>
            {invoiceNo && (
              <>
                <span className="text-muted-foreground/40">•</span>
                <span className="truncate text-muted-foreground tabular-nums">HĐ {invoiceNo}</span>
              </>
            )}
            {invoiceDate && (
              <>
                <span className="text-muted-foreground/40">•</span>
                <span className="inline-flex items-center gap-1 text-muted-foreground/90 tabular-nums">
                  <Calendar className="h-2.5 w-2.5" />
                  {invoiceDate}
                </span>
              </>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {active && (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" /> Đang chat
              </span>
            )}
            {item.match_ref && (
              <span className="inline-flex items-center gap-1 rounded-md bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-medium text-sky-700 dark:text-sky-300">
                <Link2 className="h-2.5 w-2.5" /> {item.match_ref.ref}
              </span>
            )}
            <span
              className={cn("h-2 w-2 rounded-full", bandDot(item.confidence_band))}
              title={`Tin cậy ${item.confidence}%`}
            />
          </div>
        </div>

        {/* Title + amount */}
        <div className="flex items-start justify-between gap-3">
          <h3 className="flex-1 text-[13px] font-bold leading-snug tracking-tight text-foreground uppercase line-clamp-2">
            {item.title}
          </h3>
          <div className="shrink-0 text-right flex flex-col items-end gap-1">
            {item.processing_status && (
              <StatusBadge status={item.processing_status as ProcStatus} />
            )}
            {item.posted_voucher && (
              <Link
                to={item.posted_voucher.kind === "sales_voucher" ? "/sales/vouchers" : "/purchases/vouchers"}
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1 rounded-md border border-primary/30 bg-primary/5 px-1.5 py-0.5 text-[10px] font-medium text-primary hover:bg-primary/10"
                title="Mở phiếu"
              >
                <Link2 className="h-2.5 w-2.5" /> {item.posted_voucher.voucher_no}
              </Link>
            )}
            <div className="text-[15px] font-bold leading-none tabular-nums text-foreground">
              {sign}
              {VND(Math.abs(item.amount))}
              <span className="ml-0.5 text-[10.5px] font-medium text-muted-foreground">đ</span>
            </div>
          </div>

        </div>

        {/* Goods/services line */}
        {firstItem && (
          <div className="flex items-center justify-between gap-2 text-[11.5px] text-muted-foreground">
            <div className="flex items-start gap-1.5 min-w-0">
              <span className="mt-[6px] h-1 w-1 rounded-full bg-muted-foreground/40 shrink-0" />
              <span className="truncate">
                {firstItem}
                {moreItems > 0 && (
                  <span className="ml-1 text-muted-foreground/70">+{moreItems} mục</span>
                )}
              </span>
            </div>
            {showResBadge && (
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium shrink-0",
                  matched === items.length
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                    : needsReview > 0
                    ? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                    : "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
                )}
                title={`Fin tự khớp ${matched}/${items.length} mã hệ thống${needsReview ? ` · ${needsReview} cần xem` : ""}${isNew ? ` · ${isNew} mới` : ""}`}
              >
                <Sparkles className="h-2.5 w-2.5" />
                AI khớp {matched}/{items.length}
              </span>
            )}
          </div>
        )}

        {/* Bank memo */}
        {item.source === "bank_statement" && item.subtitle && (
          <div className="text-[11px] italic text-muted-foreground">"{item.subtitle}"</div>
        )}

        {/* Proposed journal entries */}
        {item.proposal.lines.length > 0 && !item.blocker && (
          <div className="flex flex-wrap gap-1.5">
            {item.proposal.lines.slice(0, 4).map((l, i) => {
              const isDebit = (l.debit ?? 0) > 0;
              const side = isDebit ? "NỢ" : "CÓ";
              const amount = isDebit ? l.debit! : l.credit ?? 0;
              return (
                <div
                  key={i}
                  className={cn(
                    "inline-flex items-center rounded-md border px-2 py-1",
                    isDebit
                      ? "bg-indigo-50 border-indigo-100 dark:bg-indigo-500/10 dark:border-indigo-500/20"
                      : "bg-muted/70 border-border/60",
                  )}
                >
                  <span
                    className={cn(
                      "text-[10px] font-bold mr-1.5",
                      isDebit ? "text-indigo-500 dark:text-indigo-400" : "text-muted-foreground",
                    )}
                  >
                    {side}
                  </span>
                  <span
                    className={cn(
                      "text-[12px] font-semibold",
                      isDebit ? "text-indigo-900 dark:text-indigo-100" : "text-foreground",
                    )}
                  >
                    {l.account}
                  </span>
                  <span
                    className={cn(
                      "mx-1.5 h-3 w-px",
                      isDebit ? "bg-indigo-200 dark:bg-indigo-500/30" : "bg-border",
                    )}
                  />
                  <span
                    className={cn(
                      "text-[12px] font-medium tabular-nums",
                      isDebit ? "text-indigo-700 dark:text-indigo-200" : "text-foreground/80",
                    )}
                  >
                    {VND(amount)}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* Blocker / followup */}
        {item.blocker ? (
          <div className="flex items-start gap-1.5 rounded-md border border-rose-500/30 bg-rose-500/5 px-2 py-1.5 text-[11px] text-rose-700 dark:text-rose-300">
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
            <span>
              {item.blocker.reason}
              {item.blocker.notified && (
                <span className="text-muted-foreground"> · AI đã gửi tin cho {item.blocker.notified}.</span>
              )}
            </span>
          </div>
        ) : item.followups[0] && item.confidence_band === "medium" ? (
          <div className="flex items-start gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/5 px-2 py-1.5 text-[11px] text-amber-700 dark:text-amber-300">
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
    <div className="flex h-full items-center justify-center p-6">
      <EmptyState
        mood="happy"
        title={INBOX_COPY.emptyTitle}
        description={INBOX_COPY.emptyHint}
        bordered={false}
      />
    </div>
  );
}

function EmptyTab({ label }: { label: string }) {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <EmptyState
        mood="thinking"
        title={label}
        description={`${INBOX_COPY.wipTitle} — ${INBOX_COPY.wipHint.toLowerCase()}`}
        bordered={false}
      />
    </div>
  );
}



/**
 * Biến thể skeleton: hằng số module-level → tham chiếu ổn định, không re-tạo
 * mỗi lần ListSkeleton render hay khi đổi tab.
 */
type SkeletonVariant = {
  rail: string;
  hasMemo?: boolean;
  proposalCount?: number;
  extra?: "blocker" | "followup" | null;
};

const SKELETON_VARIANTS: ReadonlyArray<SkeletonVariant> = [
  { rail: "bg-emerald-500/40", proposalCount: 3, extra: null },
  { rail: "bg-amber-500/40", hasMemo: true, proposalCount: 2, extra: "followup" },
  { rail: "bg-emerald-500/40", proposalCount: 4, extra: null },
  { rail: "bg-rose-500/40", extra: "blocker" },
  { rail: "bg-amber-500/40", hasMemo: true, proposalCount: 2, extra: null },
];

/**
 * Cache mảng pills theo số lượng — tham chiếu ổn định, dùng chung cho mọi
 * SkeletonRow có cùng `proposalCount` và xuyên suốt mọi lần render.
 * Vì pill chỉ khác nhau ở key (index), ta cache luôn JSX đã build sẵn.
 */
const PILL_CACHE = new Map<number, React.ReactNode>();
function getPills(count: number): React.ReactNode {
  if (count <= 0) return null;
  const cached = PILL_CACHE.get(count);
  if (cached) return cached;
  const node = (
    <div className="mt-2 inline-flex flex-wrap gap-1.5 rounded-md bg-muted/30 px-2 py-1.5">
      {Array.from({ length: count }, (_, j) => (
        <div key={j} className="skeleton-block h-3 w-20" />
      ))}
    </div>
  );
  PILL_CACHE.set(count, node);
  return node;
}

/** Một dòng skeleton — memo theo `variant` (object tham chiếu ổn định ở module scope). */
const SkeletonRow = memo(function SkeletonRow({
  variant,
}: {
  variant: SkeletonVariant;
}) {
  const pills = getPills(variant.proposalCount ?? 0);
  return (
    <li className="skeleton-card rounded-lg border border-border/50 bg-card">
      <span className={cn("absolute inset-y-0 left-0 w-1", variant.rail)} />
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
        {variant.hasMemo && <div className="skeleton-block mt-1.5 h-3 w-3/4" />}
        {/* Row 4: proposal pills (cache theo count) */}
        {pills}
        {/* Row 5: blocker / followup */}
        {variant.extra === "blocker" && (
          <div className="skeleton-block mt-2 h-7 w-full border border-rose-500/20 bg-rose-500/5" />
        )}
        {variant.extra === "followup" && (
          <div className="skeleton-block mt-2 h-7 w-5/6 border border-amber-500/20 bg-amber-500/5" />
        )}
      </div>
    </li>
  );
});


/**
 * Không nhận prop, không có state/hook, mọi phụ thuộc (SKELETON_VARIANTS,
 * INBOX_COPY) đều là hằng số module-level → memo coi như luôn "bằng nhau"
 * và bỏ qua re-render khi parent (Inbox) đổi tab.
 */
const ListSkeleton = memo(function ListSkeleton() {
  return (
    <ul
      className="space-y-3 p-4"
      role="status"
      aria-live="polite"
      aria-label={INBOX_COPY.loading}
    >
      {SKELETON_VARIANTS.map((v, i) => (
        <SkeletonRow key={i} variant={v} />
      ))}
    </ul>
  );
});





