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
  FileText,
  Archive,
} from "lucide-react";
import type { InboxItem, ProposalItem, VoucherKind, VoucherMeta, PostedVoucherRef, MissingMasterData } from "@/lib/ai/inbox-types";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import {
  getInboxThread,
  getOrCreateInboxThread,
  getThread,
  appendMessage,
} from "@/lib/chat-threads.functions";
import { getDocument } from "@/lib/documents.functions";
import { createMissingMaster, reconcileInboxItem, updateMissingMasterAndLearn } from "@/lib/inbox-ai.functions";
import { InvoiceFileViewer } from "@/components/invoice-viewer/invoice-file-viewer";
import { ItemResolutionPanel } from "@/components/inbox/item-resolution-panel";
import { listMyTenants } from "@/lib/tenants.functions";
import type { VoucherMeta as VoucherMetaType } from "@/lib/ai/inbox-types";

function ItemResolutionPanelWrapper(props: { items?: ProposalItem[]; meta?: VoucherMetaType }) {
  const tenantsFn = useServerFn(listMyTenants);
  const tenantsQ = useQuery({ queryKey: ["my-tenants"], queryFn: () => tenantsFn() });
  const activeTenantId =
    (tenantsQ.data?.tenants as any[] | undefined)?.find((t) => t.is_active)?.id ?? null;
  return <ItemResolutionPanel items={props.items} meta={props.meta} tenantId={activeTenantId} />;
}
import { useRef, useState } from "react";
import { toast } from "sonner";

const VND = (n: number) => (Math.round(n) || 0).toLocaleString("vi-VN");

const VOUCHER_KIND_LABEL: Record<VoucherKind, string> = {
  purchase_invoice: "Phiếu mua hàng",
  sales_invoice: "Phiếu bán hàng",
  bank_receipt: "Báo Có ngân hàng",
  bank_payment: "Báo Nợ ngân hàng",
  cash_receipt: "Phiếu thu",
  cash_payment: "Phiếu chi",
  ai_insight: "Cảnh báo AI",
};

const META_FIELD_LABELS: Record<string, string> = {
  supplier_name: "Nhà cung cấp",
  supplier_tax_id: "MST NCC",
  customer_name: "Khách hàng",
  customer_tax_id: "MST KH",
  invoice_no: "Số HĐ",
  invoice_series: "Ký hiệu",
  invoice_date: "Ngày HĐ",
  subtotal: "Tiền hàng",
  vat_rate: "Thuế suất",
  vat_amount: "Thuế GTGT",
  total: "Thành tiền",
  payment_method: "Hình thức TT",
  due_date: "Hạn TT",
  bank_label: "Ngân hàng",
  bank_account: "Số TK",
  txn_date: "Ngày GD",
  txn_ref: "Mã GD",
  counterparty: "Đối tác",
  counterparty_account: "TK đối tác",
  memo: "Diễn giải",
  matched_invoice_no: "Khớp HĐ",
  cash_fund: "Quỹ TM",
  payer_or_payee: "Người nộp/nhận",
  reason: "Lý do",
  attachment_ref: "Chứng từ kèm",
  severity: "Mức độ",
  category: "Phân loại",
  period: "Kỳ",
  metric: "Chỉ số",
  delta: "Biến động",
};

const MONEY_FIELDS = new Set(["subtotal", "vat_amount", "total"]);
const DATE_FIELDS = new Set(["invoice_date", "due_date", "txn_date"]);

function formatMetaValue(key: string, value: string | number | null | undefined): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (MONEY_FIELDS.has(key)) {
    const n = Number(value);
    if (!Number.isFinite(n) || n === 0) return null;
    return VND(n) + " đ";
  }
  if (DATE_FIELDS.has(key)) {
    const d = new Date(String(value));
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleDateString("vi-VN");
  }
  if (key === "vat_rate") {
    const n = Number(value);
    return Number.isFinite(n) ? `${n}%` : String(value);
  }
  return String(value);
}

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
        <SheetHeader className="sr-only">
          <SheetTitle>Đề xuất của Fin</SheetTitle>
          <SheetDescription>Đề xuất bút toán từ AI cho mục đang chọn.</SheetDescription>
        </SheetHeader>
        {item && (
          <InboxItemDetail
            item={item}
            onApprove={onApprove}
            onSkip={onSkip}
            onRule={onRule}
            onEdit={onEdit}
            approving={approving}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

export type InboxItemDetailProps = {
  item: InboxItem;
  onApprove: (it: InboxItem) => void;
  onSkip: (it: InboxItem) => void;
  onRule: (it: InboxItem) => void;
  onEdit: (it: InboxItem) => void;
  approving?: boolean;
};

export function InboxItemDetail({
  item,
  onApprove,
  onSkip,
  onRule,
  onEdit,
  approving,
}: InboxItemDetailProps) {
  const navigate = useNavigate();
  const partnerName = item.partner?.trim();
  const hasPartner = !!partnerName && partnerName !== "—";
  const confidence = item.confidence ?? 0;
  const confTone =
    confidence >= 80 ? "emerald" : confidence >= 50 ? "amber" : "rose";
  const confClasses = {
    emerald: { text: "text-emerald-600 dark:text-emerald-400", bar: "bg-emerald-500", chip: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300" },
    amber:   { text: "text-amber-600 dark:text-amber-400",   bar: "bg-amber-500",   chip: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300" },
    rose:    { text: "text-rose-600 dark:text-rose-400",    bar: "bg-rose-500",    chip: "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300" },
  }[confTone];

  return (
    <>
      {/* Header */}
      <div className="shrink-0 space-y-0 border-b border-border/60 px-5 py-4 text-left">
        <div className="flex items-center gap-2.5">
          <div className={cn("flex h-8 w-8 items-center justify-center rounded-full", confClasses.chip)}>
            <Sparkles className="h-4 w-4" />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-semibold leading-none text-foreground">
              Đề xuất của Fin
            </h3>
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
              {item.proposal.voucher_kind && (
                <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {VOUCHER_KIND_LABEL[item.proposal.voucher_kind]}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

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

        {/* Invoice viewer / Open match */}
        <InvoiceActionRow item={item} />

        {/* Cảnh báo cần tạo mới đối tác / hàng hóa */}
        <MissingMasterDataPanel
          missing={item.missing}
          sourceDocumentId={item.source === "document" ? item.external_id : undefined}
        />

        {/* Đối soát hóa đơn ↔ bút toán */}
        <ReconciliationPanel item={item} />

        {/* Voucher meta grid */}
        <VoucherMetaGrid meta={item.proposal.meta} />

        {/* Items (goods / services) */}
        <ProposalItemsList items={item.proposal.items} />

        {/* Khớp mặt hàng với mã hệ thống */}
        <ItemResolutionPanelWrapper
          items={item.proposal.items}
          meta={item.proposal.meta}
        />

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
          {item.processing_status === "posted" ? (
            <>
              <div className="flex flex-[3] items-center justify-center gap-2 rounded-2xl bg-emerald-500/10 px-4 py-3.5 text-sm font-bold text-emerald-700 ring-1 ring-emerald-500/30 dark:text-emerald-300">
                <Archive className="h-5 w-5 opacity-90" />
                Đã ghi sổ
                {item.posted_voucher?.voucher_no && (
                  <span className="font-mono text-xs font-medium opacity-80">
                    · {item.posted_voucher.voucher_no}
                  </span>
                )}
              </div>
              {item.posted_voucher && (
                <button
                  type="button"
                  onClick={() => {
                    const to =
                      item.posted_voucher!.kind === "purchase_voucher"
                        ? "/purchases/vouchers"
                        : "/sales/vouchers";
                    navigate({ to, search: { edit: item.posted_voucher!.id } as any });
                  }}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl border border-border bg-background px-3 py-3.5 text-xs font-semibold text-foreground/80 transition-colors hover:bg-muted"
                >
                  <FileText className="h-4 w-4" />
                  Xem phiếu
                </button>
              )}
              <button
                type="button"
                onClick={() => onSkip(item)}
                aria-label="Đóng"
                className="flex w-12 items-center justify-center rounded-2xl border border-border bg-background py-3.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </>
          ) : (
            <>
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
                {approving ? "Đang ghi sổ…" : "Duyệt & ghi sổ"}
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
            </>
          )}
        </div>
        {item.processing_status !== "posted" && (
          <button
            type="button"
            onClick={() => onRule(item)}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-primary/20 bg-primary/5 py-2 text-xs font-semibold text-primary transition-all hover:bg-primary/10"
          >
            <Wand2 className="h-3.5 w-3.5" />
            Áp dụng quy tắc cho tương lai
          </button>
        )}
      </div>
    </>
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

function VoucherMetaGrid({ meta }: { meta?: VoucherMeta }) {
  if (!meta) return null;
  const all = Object.entries(meta)
    .map(([k, v]) => [k, formatMetaValue(k, v)] as const)
    .filter(([, v]) => v !== null && v !== "");
  if (all.length === 0) return null;

  const get = (k: string) => all.find(([key]) => key === k)?.[1] ?? null;
  const invoiceNo = get("invoice_no");
  const invoiceDate = get("invoice_date");
  const subtotal = get("subtotal");
  const vatAmount = get("vat_amount");
  const total = get("total");

  // Fields rendered in dedicated zones — exclude from the generic grid
  const handled = new Set(["invoice_no", "invoice_date", "subtotal", "vat_amount", "total"]);
  const FULL_WIDTH = new Set(["supplier_name", "customer_name", "memo", "reason"]);
  const rest = all.filter(([k]) => !handled.has(k));

  const summary = [invoiceNo && `HĐ ${invoiceNo}`, invoiceDate].filter(Boolean).join(" · ");

  return (
    <div className="rounded-xl border border-border/60 bg-background p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          Thông tin phiếu
        </div>
        {summary && (
          <div className="truncate text-[11px] font-medium text-foreground tabular-nums">
            {summary}
          </div>
        )}
      </div>

      {/* Tiền hàng · Thuế · Thành tiền */}
      {(subtotal || vatAmount || total) && (
        <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted/40 py-2">
          <div className="flex flex-col items-center justify-center px-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Tiền hàng
            </span>
            <span className="text-xs font-semibold tabular-nums text-foreground">
              {subtotal ?? "—"}
            </span>
          </div>
          <div className="flex flex-col items-center justify-center border-x border-border/40 px-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Thuế GTGT
            </span>
            <span className="text-xs font-semibold tabular-nums text-foreground">
              {vatAmount ?? "—"}
            </span>
          </div>
          <div className="flex flex-col items-center justify-center px-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Thành tiền
            </span>
            <span className="text-sm font-bold tabular-nums text-foreground">
              {total ?? "—"}
            </span>
          </div>
        </div>
      )}

      <dl className="mt-2 grid grid-cols-12 gap-x-3 gap-y-1.5">
        {rest.map(([k, v]) => {
          const span = FULL_WIDTH.has(k) ? "col-span-12" : "col-span-12 sm:col-span-6";
          const isNum = MONEY_FIELDS.has(k) || k === "vat_rate";
          return (
            <div key={k} className={cn("flex min-w-0 items-baseline gap-2", span)}>
              <dt className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {META_FIELD_LABELS[k] ?? k}
              </dt>
              <dd
                className={cn(
                  "min-w-0 flex-1 truncate text-xs font-medium text-foreground",
                  isNum && "tabular-nums",
                )}
                title={String(v)}
              >
                {v}
              </dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}

function ProposalItemsList({ items }: { items?: ProposalItem[] }) {
  if (!items || items.length === 0) return null;
  const nfQty = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 3 });
  const total = items.reduce((s, it) => s + (Number(it.amount) || 0), 0);
  return (
    <div className="space-y-2 rounded-2xl border border-border/60 bg-muted/30 p-4">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          Hàng hoá / dịch vụ
        </span>
        <span className="text-[10px] font-medium text-muted-foreground">
          {items.length} dòng
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border/60 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              <th className="py-1.5 pr-2 text-left font-semibold w-6">#</th>
              <th className="py-1.5 pr-2 text-left font-semibold">Tên</th>
              <th className="py-1.5 pr-2 text-left font-semibold">Mã hệ thống</th>
              <th className="py-1.5 pr-2 text-right font-semibold">SL</th>
              <th className="py-1.5 pr-2 text-left font-semibold">ĐVT</th>
              <th className="py-1.5 pr-2 text-right font-semibold">Đơn giá</th>
              <th className="py-1.5 text-right font-semibold">Thành tiền</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => {
              const r = it.resolution;
              return (
                <tr key={i} className="border-b border-border/40 last:border-0 align-top">
                  <td className="py-1.5 pr-2 font-mono text-[10px] text-muted-foreground">
                    {i + 1}
                  </td>
                  <td className="py-1.5 pr-2 font-medium text-foreground">{it.name}</td>
                  <td className="py-1.5 pr-2">
                    {r?.status === "auto" && r.best ? (
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-1">
                          <Check className="h-3 w-3 text-emerald-600 shrink-0" strokeWidth={3} />
                          <span className="font-mono text-[11px] text-emerald-700 dark:text-emerald-300">
                            {r.best.code}
                          </span>
                        </div>
                        {r.unit_converted ? (
                          <span className="text-[9px] text-muted-foreground italic">
                            1 {r.unit_converted.from ?? "?"} → {r.unit_converted.factor} {r.unit_converted.to}
                          </span>
                        ) : null}
                      </div>
                    ) : r?.status === "review" ? (
                      <span className="inline-flex items-center gap-1 rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300">
                        Cần chọn
                      </span>
                    ) : r?.status === "new" ? (
                      <span className="inline-flex items-center gap-1 rounded bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-medium text-sky-700 dark:text-sky-300">
                        Mới
                      </span>
                    ) : (
                      <span className="text-[10px] text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="py-1.5 pr-2 text-right font-mono tabular-nums text-muted-foreground">
                    {it.qty != null ? nfQty.format(it.qty) : "—"}
                  </td>
                  <td className="py-1.5 pr-2 text-muted-foreground">
                    {it.unit ?? "—"}
                  </td>
                  <td className="py-1.5 pr-2 text-right font-mono tabular-nums text-muted-foreground">
                    {it.unit_price != null ? VND(it.unit_price) : "—"}
                  </td>
                  <td className="py-1.5 text-right font-mono font-semibold tabular-nums text-foreground">
                    {VND(it.amount)}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border">
              <td colSpan={6} className="py-2 pr-2 text-right text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Tổng cộng (trước VAT)
              </td>
              <td className="py-2 text-right font-mono text-sm font-bold tabular-nums text-foreground">
                {VND(total)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function InvoiceActionRow({ item }: { item: InboxItem }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const isDoc = item.source === "document";
  const canOpenMatch = !!item.match_ref && !!item.href;
  const posted = item.posted_voucher;

  if (!isDoc && !canOpenMatch && !posted) return null;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {isDoc && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground/85 transition-colors hover:bg-muted"
          >
            <FileText className="h-3.5 w-3.5 text-primary" />
            Xem hoá đơn
          </button>
        )}
        {posted?.kind === "sales_voucher" && (
          <button
            type="button"
            onClick={() => navigate({ to: "/sales/vouchers" })}
            className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300 transition-colors hover:bg-emerald-500/20"
          >
            <ArrowRight className="h-3.5 w-3.5" />
            Xem Phiếu bán hàng ({posted.voucher_no})
          </button>
        )}
        {posted?.kind === "purchase_voucher" && (
          <button
            type="button"
            onClick={() => navigate({ to: "/purchases/vouchers" })}
            className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300 transition-colors hover:bg-emerald-500/20"
          >
            <ArrowRight className="h-3.5 w-3.5" />
            Xem Phiếu mua hàng ({posted.voucher_no})
          </button>
        )}
        {canOpenMatch && !posted && (
          <button
            type="button"
            onClick={() => navigate({ to: item.href! })}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground/85 transition-colors hover:bg-muted"
          >
            <ArrowRight className="h-3.5 w-3.5 text-primary" />
            Mở phiếu khớp {item.match_ref?.ref ? `(${item.match_ref.ref})` : ""}
          </button>
        )}
      </div>

      {isDoc && open && (
        <InvoiceViewerDialog
          documentId={item.external_id}
          onOpenChange={(v) => setOpen(v)}
        />
      )}
    </>
  );
}

type MissingRowEntity = "customer" | "supplier" | "product" | "service";
type MissingItemType =
  | "goods"
  | "service"
  | "material"
  | "tool"
  | "asset_alloc"
  | "asset_tangible"
  | "asset_intangible";

const ITEM_TYPE_OPTIONS: { value: MissingItemType; label: string }[] = [
  { value: "goods", label: "Hàng hoá (TK 156)" },
  { value: "material", label: "Nguyên vật liệu (TK 152)" },
  { value: "tool", label: "Công cụ dụng cụ (TK 153)" },
  { value: "asset_alloc", label: "Tài sản phân bổ (TK 242)" },
  { value: "asset_tangible", label: "TSCĐ hữu hình (TK 211)" },
  { value: "asset_intangible", label: "TSCĐ vô hình (TK 213)" },
  { value: "service", label: "Dịch vụ" },
];

function MissingMasterDataPanel({
  missing,
  sourceDocumentId,
}: {
  missing?: MissingMasterData;
  sourceDocumentId?: string;
}) {
  const qc = useQueryClient();
  const createFn = useServerFn(createMissingMaster);
  const updateFn = useServerFn(updateMissingMasterAndLearn);
  const [pending, setPending] = useState<string | null>(null);
  const [doneKeys, setDoneKeys] = useState<Set<string>>(() => new Set());
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ name: string; tax_id: string; item_type: MissingItemType }>({
    name: "",
    tax_id: "",
    item_type: "goods",
  });

  if (!missing) return null;
  type Row = {
    key: string;
    label: string;
    value: string;
    entity: MissingRowEntity;
    tax_id?: string;
    suggestion?: {
      item_type: MissingItemType;
      account: string;
      confidence: number;
      reason?: string;
    };
  };
  const rows: Row[] = [];
  if (missing.customer)
    rows.push({
      key: `customer:${missing.customer}`,
      label: "Khách hàng",
      value: missing.customer,
      entity: "customer",
      tax_id: missing.customer_tax_id,
    });
  if (missing.supplier)
    rows.push({
      key: `supplier:${missing.supplier}`,
      label: "Nhà cung cấp",
      value: missing.supplier,
      entity: "supplier",
      tax_id: missing.supplier_tax_id,
    });
  for (const p of missing.products ?? []) {
    const it = (p.item_type ?? "goods") as MissingItemType;
    rows.push({
      key: `product:${p.name}`,
      label: it === "service" ? "Dịch vụ" : "Hàng hoá",
      value: p.name,
      entity: it === "service" ? "service" : "product",
      suggestion: {
        item_type: it,
        account: p.account ?? "156",
        confidence: p.confidence ?? 0,
        reason: p.reason,
      },
    });
  }
  if (rows.length === 0) return null;

  const invalidate = (entity: MissingRowEntity) => {
    qc.invalidateQueries({ queryKey: ["inbox-ai"] });
    if (entity === "customer") qc.invalidateQueries({ queryKey: ["customers"] });
    if (entity === "supplier") qc.invalidateQueries({ queryKey: ["suppliers"] });
    if (entity === "product" || entity === "service")
      qc.invalidateQueries({ queryKey: ["products"] });
    qc.invalidateQueries({ queryKey: ["ai-memory"] });
  };

  const handleCreate = async (r: Row) => {
    setPending(r.key);
    try {
      const res = await createFn({
        data: {
          entity: r.entity,
          name: r.value,
          tax_id: r.tax_id,
          item_type: r.suggestion?.item_type,
        },
      });
      setDoneKeys((prev) => new Set(prev).add(r.key));
      toast.success(
        res.existed
          ? `${r.label} đã có trong hệ thống`
          : `Đã tạo mới ${r.label.toLowerCase()}: ${r.value}`,
      );
      invalidate(r.entity);
    } catch (e: any) {
      toast.error(e?.message ?? "Không tạo được");
    } finally {
      setPending(null);
    }
  };

  const openEdit = (r: Row) => {
    setEditingKey(r.key);
    setDraft({
      name: r.value,
      tax_id: r.tax_id ?? "",
      item_type: r.suggestion?.item_type ?? (r.entity === "service" ? "service" : "goods"),
    });
  };


  const handleSaveEdit = async (r: Row) => {
    setPending(r.key);
    try {
      const isParty = r.entity === "customer" || r.entity === "supplier";
      await updateFn({
        data: {
          entity: r.entity,
          original_name: r.value,
          corrected: {
            name: draft.name.trim() || r.value,
            tax_id: isParty ? draft.tax_id.trim() || undefined : undefined,
            item_type: !isParty ? draft.item_type : undefined,
          },
          source_document_id: sourceDocumentId,
        },
      });
      setDoneKeys((prev) => new Set(prev).add(r.key));
      setEditingKey(null);
      toast.success(`Đã lưu & dạy AI: ${draft.name}`);
      invalidate(r.entity);
    } catch (e: any) {
      toast.error(e?.message ?? "Không lưu được");
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="rounded-2xl border border-amber-500/40 bg-amber-500/5 p-4 space-y-2">
      <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-amber-700 dark:text-amber-300">
        <AlertTriangle className="h-3.5 w-3.5" />
        Cần tạo mới vào hệ thống
      </div>
      <p className="text-[11px] text-amber-700/80 dark:text-amber-300/80">
        Khi bấm <b>Duyệt &amp; ghi sổ</b>, hệ thống sẽ tự tạo các mục bên dưới theo gợi ý của Fin.
        Nếu gợi ý chưa đúng, bấm <b>Sửa</b> để chỉnh và dạy lại AI.
      </p>
      <ul className="space-y-1.5 text-xs text-amber-800 dark:text-amber-200">
        {rows.map((r) => {
          const isDone = doneKeys.has(r.key);
          const isPending = pending === r.key;
          const isEditing = editingKey === r.key;
          const isParty = r.entity === "customer" || r.entity === "supplier";

          return (
            <li
              key={r.key}
              className="rounded-lg bg-background/40 px-2 py-1.5 space-y-2"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-start gap-1.5 min-w-0">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-amber-500" />
                  <span className="min-w-0">
                    <span className="font-semibold">{r.label}:</span>{" "}
                    <span className="font-medium break-words">{r.value}</span>
                    {r.tax_id ? (
                      <span className="ml-1 text-amber-700/70 dark:text-amber-300/70">
                        (MST {r.tax_id})
                      </span>
                    ) : null}
                    {r.suggestion ? (
                      <span
                        className="ml-1.5 inline-flex items-center gap-1 rounded-md border border-amber-500/40 bg-background/60 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 dark:text-amber-200"
                        title={r.suggestion.reason ?? ""}
                      >
                        <Sparkles className="h-2.5 w-2.5" />
                        {ITEM_TYPE_OPTIONS.find((o) => o.value === r.suggestion!.item_type)?.label ??
                          r.suggestion.item_type}
                        {r.suggestion.confidence > 0 ? (
                          <span className="text-amber-700/70 dark:text-amber-300/70">
                            · {r.suggestion.confidence}%
                          </span>
                        ) : null}
                      </span>
                    ) : null}
                  </span>

                </div>
                {isDone ? (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-emerald-500/15 px-2 py-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                    <Check className="h-3 w-3" strokeWidth={3} />
                    Đã tạo
                  </span>
                ) : (
                  <div className="flex shrink-0 items-center gap-1">
                    {!isEditing ? (
                      <button
                        type="button"
                        onClick={() => openEdit(r)}
                        disabled={isPending}
                        className="inline-flex items-center gap-1 rounded-md border border-amber-500/40 bg-background/60 px-2 py-1 text-[11px] font-semibold text-amber-800 transition-colors hover:bg-amber-500/10 disabled:opacity-60 dark:text-amber-200"
                      >
                        <Pencil className="h-3 w-3" />
                        Sửa
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => handleCreate(r)}
                      disabled={isPending}
                      className="inline-flex items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[11px] font-semibold text-amber-800 transition-colors hover:bg-amber-500/20 disabled:opacity-60 dark:text-amber-200"
                    >
                      {isPending ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Sparkles className="h-3 w-3" />
                      )}
                      Tạo mới
                    </button>
                  </div>
                )}
              </div>

              {isEditing && !isDone ? (
                <div className="rounded-md border border-amber-500/30 bg-background/70 p-2 space-y-2">
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <label className="text-[11px] font-medium text-amber-800 dark:text-amber-200 space-y-1">
                      <span>Tên đúng</span>
                      <input
                        type="text"
                        value={draft.name}
                        onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                        className="w-full rounded-md border border-input bg-background px-2 py-1 text-xs"
                      />
                    </label>
                    {isParty ? (
                      <label className="text-[11px] font-medium text-amber-800 dark:text-amber-200 space-y-1">
                        <span>MST</span>
                        <input
                          type="text"
                          value={draft.tax_id}
                          onChange={(e) => setDraft({ ...draft, tax_id: e.target.value })}
                          className="w-full rounded-md border border-input bg-background px-2 py-1 text-xs"
                        />
                      </label>
                    ) : (
                      <label className="text-[11px] font-medium text-amber-800 dark:text-amber-200 space-y-1">
                        <span>Loại</span>
                        <select
                          value={draft.item_type}
                          onChange={(e) =>
                            setDraft({ ...draft, item_type: e.target.value as MissingItemType })
                          }
                          className="w-full rounded-md border border-input bg-background px-2 py-1 text-xs"
                        >
                          {ITEM_TYPE_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                  </div>
                  <div className="flex items-center justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => setEditingKey(null)}
                      disabled={isPending}
                      className="inline-flex items-center gap-1 rounded-md border border-input bg-background px-2 py-1 text-[11px] font-medium text-foreground hover:bg-muted/50 disabled:opacity-60"
                    >
                      Huỷ
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSaveEdit(r)}
                      disabled={isPending || !draft.name.trim()}
                      className="inline-flex items-center gap-1 rounded-md bg-amber-500 px-2 py-1 text-[11px] font-semibold text-white hover:bg-amber-600 disabled:opacity-60"
                    >
                      {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />}
                      Lưu &amp; dạy AI
                    </button>
                  </div>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}


function InvoiceViewerDialog({
  documentId,
  onOpenChange,
}: {
  documentId: string;
  onOpenChange: (v: boolean) => void;
}) {
  const getDocumentFn = useServerFn(getDocument);
  const q = useQuery({
    queryKey: ["inbox-doc-viewer", documentId],
    queryFn: () => getDocumentFn({ data: { id: documentId } }),
    staleTime: 60_000,
  });

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="text-sm">
            {q.data?.doc?.original_filename ?? "Hoá đơn"}
          </DialogTitle>
        </DialogHeader>
        {q.isLoading ? (
          <div className="flex h-72 items-center justify-center">
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
      </DialogContent>
    </Dialog>
  );
}

function ReconciliationPanel({ item }: { item: InboxItem }) {
  const reconcileFn = useServerFn(reconcileInboxItem);
  const source =
    item.source === "document"
      ? "document"
      : item.id.startsWith("sales_invoice:")
        ? "sales_invoice"
        : null;
  const isPosted =
    item.processing_status === "posted" || !!item.posted_voucher;

  const q = useQuery({
    queryKey: ["inbox-reconcile", item.id],
    queryFn: () =>
      reconcileFn({
        data: { external_id: item.external_id, source: source as any },
      }),
    enabled: isPosted && (source === "document" || source === "sales_invoice"),
    staleTime: 30_000,
  });

  if (!isPosted) return null;
  if (q.isLoading) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-border/60 bg-muted/30 p-4 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Đang đối soát hóa đơn với bút toán…
      </div>
    );
  }
  if (q.isError) {
    return (
      <div className="rounded-2xl border border-rose-500/40 bg-rose-500/5 p-4 text-xs text-rose-700 dark:text-rose-300">
        Không đối soát được:{" "}
        {(q.error as any)?.message ?? "lỗi không xác định"}
      </div>
    );
  }
  const r = q.data;
  if (!r || r.status === "not_posted") return null;

  const tone =
    r.status === "matched"
      ? {
          ring: "border-emerald-500/40 bg-emerald-500/5",
          label: "text-emerald-700 dark:text-emerald-300",
          icon: <CheckCircle2 className="h-3.5 w-3.5" />,
          title: "Khớp 100% với bút toán",
        }
      : r.status === "mismatched"
        ? {
            ring: "border-rose-500/40 bg-rose-500/5",
            label: "text-rose-700 dark:text-rose-300",
            icon: <AlertTriangle className="h-3.5 w-3.5" />,
            title: "Phát hiện chênh lệch",
          }
        : {
            ring: "border-amber-500/40 bg-amber-500/5",
            label: "text-amber-700 dark:text-amber-300",
            icon: <AlertTriangle className="h-3.5 w-3.5" />,
            title: "Khớp một phần",
          };

  const passed = r.checks.filter((c) => c.ok).length;
  const total = r.checks.length;

  return (
    <div className={cn("rounded-2xl border p-4 space-y-3", tone.ring)}>
      <div className="flex items-center justify-between gap-2">
        <div
          className={cn(
            "flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest",
            tone.label,
          )}
        >
          {tone.icon}
          Đối soát hóa đơn ↔ bút toán
        </div>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
            tone.label,
            "bg-background/60",
          )}
        >
          {passed}/{total} khớp
        </span>
      </div>
      <p className={cn("text-xs font-semibold", tone.label)}>{tone.title}</p>
      <div className="overflow-hidden rounded-xl border border-border/40 bg-background/60">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="border-b border-border/40 bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
              <th className="px-2.5 py-1.5 text-left font-semibold">Chỉ tiêu</th>
              <th className="px-2.5 py-1.5 text-right font-semibold">
                Hóa đơn
              </th>
              <th className="px-2.5 py-1.5 text-right font-semibold">
                Bút toán
              </th>
              <th className="px-2.5 py-1.5 text-center font-semibold w-10">
                
              </th>
            </tr>
          </thead>
          <tbody>
            {r.checks.map((c) => (
              <tr
                key={c.key}
                className="border-b border-border/30 last:border-b-0"
              >
                <td className="px-2.5 py-1.5 text-foreground/85">{c.label}</td>
                <td className="px-2.5 py-1.5 text-right font-mono tabular-nums text-foreground/70">
                  {c.expected}
                </td>
                <td
                  className={cn(
                    "px-2.5 py-1.5 text-right font-mono tabular-nums",
                    c.ok
                      ? "text-foreground/80"
                      : c.severity === "error"
                        ? "text-rose-700 dark:text-rose-300 font-semibold"
                        : "text-amber-700 dark:text-amber-300 font-semibold",
                  )}
                >
                  {c.actual}
                </td>
                <td className="px-2.5 py-1.5 text-center">
                  {c.ok ? (
                    <Check
                      className="mx-auto h-3 w-3 text-emerald-500"
                      strokeWidth={3}
                    />
                  ) : (
                    <X
                      className={cn(
                        "mx-auto h-3 w-3",
                        c.severity === "error"
                          ? "text-rose-500"
                          : "text-amber-500",
                      )}
                      strokeWidth={3}
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {r.totals &&
        r.totals.invoice_total != null &&
        Math.abs(r.totals.diff) > 1 && (
          <p className="text-[11px] text-muted-foreground">
            Chênh lệch tổng tiền:{" "}
            <span className="font-mono font-semibold text-foreground">
              {(Math.round(r.totals.diff) || 0).toLocaleString("vi-VN")} đ
            </span>
          </p>
        )}
    </div>
  );
}
