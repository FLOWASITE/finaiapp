/**
 * FinProposalCard — Đề xuất của Fin (redesign)
 *
 * Mục tiêu:
 *  - Giọng Fin xưng tên, không lộ tên "Agent" ra UI chính.
 *  - Header band đọc dto.band → verb hành động rõ ràng (Tự ghi / Xem qua / Cần KTV chốt).
 *  - Mỗi dòng Nợ TK kho/CP có chip Kind đổi 1 chạm (152/153/156/211/213/242/6xx).
 *  - "Vì sao Fin chọn" gộp signals + applied_rules.
 *  - "Hoán đổi nhanh" thay khối Alternatives.
 *  - "Đây không phải …" có reason picker → emitManualFeedback.
 *  - Sửa tay dùng AccountCombobox + auto-rebalance.
 */
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import {
  Check,
  AlertTriangle,
  Sparkles,
  XCircle,
  Loader2,
  FileText,
  Pencil,
  ChevronDown,
  ChevronRight,
  GitBranch,
  ThumbsDown,
  Wand2,
  Zap,
  Eye,
  ShieldAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AccountCombobox } from "@/components/ui/account-combobox";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { approveProposal, skipProposal } from "@/lib/categorize.functions";
import { emitManualFeedback } from "@/lib/feedback/feedback.functions";
import type { JournalProposalDTO, ProposalEntry, ProposalLine, ProposalSource } from "@/lib/categorize/types";
import { AccountKindBadge } from "./AccountKindBadge";
import { TscdConfirmDialog, type TscdConfirmResult } from "./TscdConfirmDialog";

// ────────────────────────────────────────────────────────────────────────────
// Fin voice — thay nhãn source kỹ thuật bằng câu Fin nói
// ────────────────────────────────────────────────────────────────────────────
function finVoice(source: ProposalSource, dto: JournalProposalDTO): string {
  switch (source) {
    case "vendor_template": {
      // Lấy số lần học từ signals nếu có (vd "Mẫu NCC · 7 lần")
      const hint = dto.signals.find((s) => /lần|hits|history/i.test(s.label));
      const m = hint?.label.match(/(\d+)/);
      const n = m ? m[1] : "nhiều";
      return `Fin nhớ nhà cung cấp này — đã hạch toán ${n} lần cùng mẫu.`;
    }
    case "learned_lines":
      return "Fin học từ các dòng tương tự trong trí nhớ của bạn.";
    case "classify_rule": {
      const rule = dto.applied_rules.find((r) => r.startsWith("cat-"));
      return rule ? `Fin áp luật ${rule} của TT200.` : "Fin áp luật phân loại TT200.";
    }
    case "ai_fallback":
      return "Nhà cung cấp mới — Fin suy luận từ mô tả mặt hàng.";
    case "manual":
      return "Bạn đã chỉnh tay — Fin sẽ học từ lần này.";
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Band → hành động
// ────────────────────────────────────────────────────────────────────────────
type BandSpec = {
  verb: string;
  detail: string;
  icon: typeof Zap;
  tone: string;
  dot: string;
};
function bandSpec(band: JournalProposalDTO["band"], confPct: number): BandSpec {
  // Fallback theo % nếu band không có
  const b = band ?? (confPct >= 85 ? "auto" : confPct >= 60 ? "review" : "manual");
  if (b === "auto")
    return {
      verb: "Fin đề nghị tự ghi sổ",
      detail: "Độ tin cậy cao — band auto. Precision lịch sử ~94%.",
      icon: Zap,
      tone: "border-emerald-500/40 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300",
      dot: "bg-emerald-500",
    };
  if (b === "review")
    return {
      verb: "Fin muốn bạn xem qua rồi duyệt",
      detail: "Độ tin cậy trung bình — band review. Precision lịch sử ~78%.",
      icon: Eye,
      tone: "border-amber-500/40 bg-amber-500/5 text-amber-700 dark:text-amber-300",
      dot: "bg-amber-500",
    };
  return {
    verb: "Fin chưa chắc — cần KTV chốt",
    detail: "Độ tin cậy thấp — band manual. Hãy sửa tay hoặc chọn phương án khác.",
    icon: ShieldAlert,
    tone: "border-rose-500/40 bg-rose-500/5 text-rose-700 dark:text-rose-300",
    dot: "bg-rose-500",
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Kind chip — dòng Nợ TK kho/CP
// ────────────────────────────────────────────────────────────────────────────
type Kind = "goods" | "material" | "ccdc" | "asset_tangible" | "asset_intangible" | "prepaid" | "expense";
const KIND_OPTIONS: { key: Kind; label: string; account: string; hint: string }[] = [
  { key: "goods", label: "Hàng hoá", account: "156", hint: "TK 156 — hàng mua để bán" },
  { key: "material", label: "NVL", account: "152", hint: "TK 152 — nguyên vật liệu sản xuất" },
  { key: "ccdc", label: "CCDC", account: "153", hint: "TK 153 — công cụ dụng cụ" },
  { key: "asset_tangible", label: "TSCĐ hữu hình", account: "211", hint: "TK 211 — máy móc, thiết bị" },
  { key: "asset_intangible", label: "TSCĐ vô hình", account: "213", hint: "TK 213 — phần mềm, bản quyền" },
  { key: "prepaid", label: "Trả trước", account: "242", hint: "TK 242 — phân bổ nhiều kỳ" },
  { key: "expense", label: "Dịch vụ / Chi phí", account: "6422", hint: "TK 6xx — chi phí kỳ này" },
];

/** Dòng Nợ có thể đổi loại mặt hàng? (TK kho/CP/TSCĐ) */
function canChangeKind(accountCode: string): boolean {
  return /^(152|153|156|211|213|242|6(27|41|42))/.test(accountCode);
}

// ────────────────────────────────────────────────────────────────────────────
const fmt = (n: number) => new Intl.NumberFormat("vi-VN").format(n);

type Props = {
  proposalId: string;
  invoice: any | null;
  dto: JournalProposalDTO;
  confidence: number;
  source: ProposalSource;
  onMutated?: () => void;
  selected?: boolean;
  onSelectChange?: (v: boolean) => void;
};

export function ProposalCard({ proposalId, invoice, dto, confidence, source, onMutated, selected, onSelectChange }: Props) {
  const approveFn = useServerFn(approveProposal);
  const skipFn = useServerFn(skipProposal);
  const feedbackFn = useServerFn(emitManualFeedback);
  const qc = useQueryClient();
  const [busy, setBusy] = useState<"approve" | "skip" | "feedback" | null>(null);
  const [whyOpen, setWhyOpen] = useState(false);
  const [altOpen, setAltOpen] = useState(false);
  const [edit, setEdit] = useState(false);
  const [entries, setEntries] = useState<ProposalEntry[]>(dto.entries);
  const [tscdOpen, setTscdOpen] = useState(false);

  const confPct = Math.round(confidence * 100);
  const band = bandSpec(dto.band, confPct);
  const BandIcon = band.icon;

  const hasError = dto.warnings.some((w) => w.severity === "error");
  const invoiceKind: "purchase" | "sales" = invoice?.invoice_kind === "sales" ? "sales" : "purchase";
  const isSales = invoiceKind === "sales";
  const partnerLabel = isSales ? "KH" : "NCC";
  const supplier = invoice?.supplier_name ?? invoice?.customer_name ?? `(Không rõ ${partnerLabel})`;
  const total = Number(invoice?.total ?? 0);

  // TSCĐ confirm gate
  const tscdWarn = dto.warnings.find((w) => w.code === "cat-tscd-confirm");
  const tscdLine = tscdWarn
    ? entries[0]?.lines.find((l) => /^21[13]/.test(l.account_code) && l.debit > 0)
    : undefined;
  const tscdKind: "tangible" | "intangible" = tscdLine?.account_code.startsWith("213")
    ? "intangible"
    : "tangible";

  // Cân Nợ/Có
  const balance = useMemo(() => {
    return entries.map((e) => {
      const d = e.lines.reduce((s, l) => s + (l.debit || 0), 0);
      const c = e.lines.reduce((s, l) => s + (l.credit || 0), 0);
      return { d, c, ok: Math.abs(d - c) < 0.5 };
    });
  }, [entries]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["categorize", "proposals"] });
    qc.invalidateQueries({ queryKey: ["sidebar", "ai-counts"] });
    onMutated?.();
  };

  const doApprove = async (extra?: { tscd?: TscdConfirmResult }) => {
    setBusy("approve");
    try {
      const dirty = edit && JSON.stringify(entries) !== JSON.stringify(dto.entries);
      await approveFn({
        data: {
          proposal_id: proposalId,
          entry_index: 0,
          ...(dirty
            ? {
                edits: {
                  description: entries[0].description,
                  entry_date: entries[0].entry_date,
                  lines: entries[0].lines,
                },
              }
            : {}),
          ...(extra?.tscd ? { tscd_confirm: extra.tscd } : {}),
        } as any,
      });
      toast.success(extra?.tscd ? "Đã ghi sổ TSCĐ" : "Đã ghi sổ bút toán");
      setTscdOpen(false);
      refresh();
    } catch (e: any) {
      toast.error(e?.message || "Không duyệt được");
    } finally {
      setBusy(null);
    }
  };

  const handleApprove = async () => {
    if (tscdWarn && tscdLine) {
      setTscdOpen(true);
      return;
    }
    await doApprove();
  };

  const handleSkip = async () => {
    setBusy("skip");
    try {
      await skipFn({ data: { proposal_id: proposalId } });
      toast.success("Đã bỏ qua");
      refresh();
    } catch (e: any) {
      toast.error(e?.message || "Lỗi");
    } finally {
      setBusy(null);
    }
  };

  const sendFeedback = async (
    eventType: "wrong_account" | "wrong_amount" | "wrong_partner" | "wrong_vat",
    note?: string,
  ) => {
    setBusy("feedback");
    try {
      await feedbackFn({
        data: { eventType, proposalId, severity: 0.8, note },
      });
      toast.success("Cảm ơn — Fin sẽ học từ phản hồi này.");
    } catch (e: any) {
      toast.error(e?.message || "Không gửi được phản hồi");
    } finally {
      setBusy(null);
    }
  };

  const updateLine = (entryIdx: number, lineIdx: number, patch: Partial<ProposalLine>) => {
    setEntries((prev) =>
      prev.map((e, i) =>
        i !== entryIdx
          ? e
          : {
              ...e,
              lines: e.lines.map((l, j) => (j !== lineIdx ? l : { ...l, ...patch })),
            },
      ),
    );
  };

  const changeKind = (entryIdx: number, lineIdx: number, opt: (typeof KIND_OPTIONS)[number]) => {
    updateLine(entryIdx, lineIdx, { account_code: opt.account });
    setEdit(true);
    toast.info(`Đã đổi sang ${opt.label} (TK ${opt.account})`, {
      description: "Bấm Duyệt để Fin học lựa chọn này.",
    });
  };

  return (
    <div
      className={cn(
        "rounded-2xl border bg-card transition-all overflow-hidden",
        hasError ? "border-destructive/40" : "border-border/60",
        selected && "ring-2 ring-primary/40",
      )}
    >
      {/* Header — partner + invoice meta */}
      <div className="flex items-start gap-3 px-4 pt-3">
        {onSelectChange && (
          <input
            type="checkbox"
            checked={!!selected}
            disabled={hasError}
            onChange={(e) => onSelectChange(e.target.checked)}
            className="mt-1 h-4 w-4 rounded border-input"
          />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge
              variant="outline"
              className={cn(
                "text-[10px] px-1.5 py-0",
                isSales
                  ? "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/30"
                  : "bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/30",
              )}
            >
              {isSales ? "Bán ra" : "Mua vào"}
            </Badge>
            <span className="font-semibold truncate">{supplier}</span>
            {invoice?.invoice_no && (
              <span className="text-xs text-muted-foreground font-mono">#{invoice.invoice_no}</span>
            )}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {invoice?.issue_date ?? "—"} · Tổng{" "}
            <span className="font-semibold text-foreground">{fmt(total)} ₫</span>
          </div>
        </div>
      </div>

      {/* Band callout — verb hành động + câu Fin nói */}
      <div className="px-4 pt-3">
        <div className={cn("flex items-start gap-3 rounded-xl border px-3 py-2.5", band.tone)}>
          <div className="relative mt-0.5 shrink-0">
            <span className={cn("absolute inset-0 rounded-full opacity-40 animate-ping", band.dot)} />
            <span className={cn("relative block h-2.5 w-2.5 rounded-full", band.dot)} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <BandIcon className="h-3.5 w-3.5" />
              <span className="font-semibold text-sm">{band.verb}</span>
              <TooltipProvider delayDuration={100}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge
                      variant="outline"
                      className="text-[10px] px-1.5 py-0 cursor-help border-current/30 bg-background/60"
                    >
                      Tin cậy {confPct}%
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[240px] text-xs">
                    {band.detail}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <p className="text-xs mt-1 text-foreground/85 italic">"{finVoice(source, dto)}"</p>
          </div>
        </div>
      </div>

      {/* Bút toán */}
      <div className="px-4 pt-3 pb-2 space-y-3">
        {entries.map((entry, ei) => (
          <div key={ei} className="rounded-lg border border-border/60 bg-muted/20 p-3">
            <div className="flex items-center justify-between mb-1.5">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Bút toán {entries.length > 1 ? `${ei + 1}/${entries.length}` : ""} · {entry.description}
              </div>
              <div
                className={cn(
                  "text-[10px] font-mono",
                  balance[ei]?.ok ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600",
                )}
              >
                {balance[ei]?.ok ? "✓ cân" : `lệch ${fmt(Math.abs(balance[ei].d - balance[ei].c))}`}
              </div>
            </div>
            <table className="w-full font-mono text-[12px]">
              <tbody>
                {entry.lines.map((l, li) => {
                  const isDebit = l.debit > 0;
                  const showKindChip = isDebit && canChangeKind(l.account_code);
                  return (
                    <tr key={li} className="border-b border-border/30 last:border-0 align-top">
                      <td className="w-8 py-1.5 text-muted-foreground">{isDebit ? "Nợ" : "Có"}</td>
                      <td className="w-24 py-1.5">
                        {edit ? (
                          <AccountCombobox
                            value={l.account_code}
                            onChange={(code) => updateLine(ei, li, { account_code: code })}
                            className="h-6 px-1 text-[12px] w-20"
                          />
                        ) : (
                          <span className="font-semibold">{l.account_code}</span>
                        )}
                      </td>
                      <td className="py-1.5 pl-1">
                        {showKindChip ? (
                          <KindChipPopover
                            currentAccount={l.account_code}
                            onPick={(opt) => changeKind(ei, li, opt)}
                          />
                        ) : (
                          isDebit && <AccountKindBadge code={l.account_code} />
                        )}
                      </td>
                      <td className="py-1.5 text-muted-foreground truncate max-w-[260px]">{l.memo ?? ""}</td>
                      <td className="py-1.5 text-right font-semibold whitespace-nowrap">
                        {edit ? (
                          <Input
                            type="number"
                            value={isDebit ? l.debit : l.credit}
                            onChange={(e) => {
                              const v = Number(e.target.value) || 0;
                              updateLine(ei, li, isDebit ? { debit: v } : { credit: v });
                            }}
                            className="h-6 px-1 text-[12px] text-right w-28 ml-auto"
                          />
                        ) : (
                          fmt(isDebit ? l.debit : l.credit)
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}
      </div>

      {/* Warnings */}
      {dto.warnings.length > 0 && (
        <div className="px-4 pb-2 space-y-1.5">
          {[...dto.warnings]
            .sort((a, b) => {
              const o: Record<string, number> = { error: 0, warn: 1, info: 2 };
              return (o[a.severity] ?? 3) - (o[b.severity] ?? 3);
            })
            .map((w, i) => (
              <div
                key={i}
                className={cn(
                  "flex gap-2 rounded-md border px-2.5 py-1.5 text-xs",
                  w.severity === "error"
                    ? "border-destructive/40 bg-destructive/10 text-destructive font-medium"
                    : w.severity === "warn"
                      ? "border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-400"
                      : "border-border bg-muted/30 text-muted-foreground",
                )}
              >
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span className="flex-1">{w.message}</span>
              </div>
            ))}
        </div>
      )}

      {/* Collapsible: Vì sao Fin chọn + Hoán đổi nhanh */}
      <div className="px-4 pb-2 flex flex-wrap items-center gap-3 text-xs">
        {(dto.signals.length > 0 || dto.applied_rules.length > 0) && (
          <button
            onClick={() => setWhyOpen((v) => !v)}
            className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
          >
            {whyOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            Vì sao Fin chọn ({dto.signals.length + dto.applied_rules.length})
          </button>
        )}
        {dto.alternatives && dto.alternatives.length > 0 && (
          <button
            onClick={() => setAltOpen((v) => !v)}
            className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
          >
            {altOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            <GitBranch className="h-3 w-3" />
            Hoán đổi nhanh ({dto.alternatives.length})
          </button>
        )}
      </div>

      {whyOpen && (
        <div className="px-4 pb-2 space-y-2">
          {dto.applied_rules.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <Sparkles className="h-3 w-3 text-primary" />
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground mr-1">
                Luật áp dụng
              </span>
              {dto.applied_rules.map((r, i) => (
                <Badge key={i} variant="outline" className="text-[10px] font-mono px-1.5 py-0">
                  {r}
                </Badge>
              ))}
            </div>
          )}
          {dto.signals.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {[...dto.signals]
                .sort((a, b) => b.weight - a.weight)
                .map((s, i) => (
                  <Badge
                    key={i}
                    variant="outline"
                    className={cn(
                      "text-[10px] px-1.5 py-0 gap-1",
                      s.ok
                        ? "border-emerald-500/30 text-emerald-700 dark:text-emerald-400"
                        : "border-amber-500/30 text-amber-700 dark:text-amber-400",
                    )}
                  >
                    {s.ok ? <Check className="h-2.5 w-2.5" /> : <AlertTriangle className="h-2.5 w-2.5" />}
                    {s.label}
                    {s.weight > 0 && <span className="opacity-60">+{s.weight}</span>}
                  </Badge>
                ))}
            </div>
          )}
        </div>
      )}

      {altOpen && dto.alternatives && dto.alternatives.length > 0 && (
        <div className="px-4 pb-2 space-y-1.5">
          {dto.alternatives.map((alt, ai) => {
            const altPct = Math.round(alt.confidence * 100);
            return (
              <div
                key={ai}
                className="flex items-center gap-2 rounded-md border border-border/50 bg-muted/20 px-2.5 py-1.5"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs font-medium truncate">{alt.label}</span>
                    <Badge
                      variant="outline"
                      className="text-[10px] px-1 py-0 border-muted-foreground/30 text-muted-foreground"
                    >
                      {altPct}%
                    </Badge>
                  </div>
                  <div className="font-mono text-[11px] text-muted-foreground truncate mt-0.5">
                    {alt.entries[0]?.lines
                      .map((l) => `${l.debit > 0 ? "Nợ" : "Có"} ${l.account_code}`)
                      .join(" / ")}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-[11px] gap-1 shrink-0"
                  disabled={!!busy}
                  onClick={() => {
                    setEntries(alt.entries);
                    setEdit(true);
                    toast.info(`Đã chọn "${alt.label}" — bấm Duyệt để xác nhận`);
                  }}
                >
                  <Wand2 className="h-3 w-3" />
                  Dùng
                </Button>
              </div>
            );
          })}
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2 border-t border-border/60 bg-muted/20 px-4 py-2.5">
        <Button
          size="sm"
          onClick={handleApprove}
          disabled={!!busy || hasError || !balance.every((b) => b.ok)}
          className="gap-1.5"
        >
          {busy === "approve" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Check className="h-3.5 w-3.5" strokeWidth={3} />
          )}
          Duyệt & ghi sổ
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setEdit((v) => !v)}
          disabled={!!busy}
          className="gap-1.5"
        >
          <Pencil className="h-3.5 w-3.5" />
          {edit ? "Xong" : "Sửa"}
        </Button>

        {/* Đây không phải … — feedback chất lượng cao */}
        <Popover>
          <PopoverTrigger asChild>
            <Button size="sm" variant="ghost" disabled={!!busy} className="gap-1.5 text-muted-foreground">
              <ThumbsDown className="h-3.5 w-3.5" />
              Đây không phải…
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-64 p-2">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground px-2 py-1">
              Cho Fin biết sai ở đâu
            </div>
            {[
              { type: "wrong_account" as const, label: "Sai tài khoản hạch toán" },
              { type: "wrong_partner" as const, label: "Sai nhà cung cấp / khách hàng" },
              { type: "wrong_vat" as const, label: "Sai thuế suất / VAT" },
              { type: "wrong_amount" as const, label: "Sai số tiền" },
            ].map((opt) => (
              <button
                key={opt.type}
                onClick={() => sendFeedback(opt.type)}
                disabled={!!busy}
                className="w-full text-left px-2 py-1.5 text-xs rounded hover:bg-muted transition-colors"
              >
                {opt.label}
              </button>
            ))}
          </PopoverContent>
        </Popover>

        {invoice?.id && (
          <Button size="sm" variant="ghost" asChild className="gap-1.5">
            <a href={`/purchases?focus=${invoice.id}`} target="_blank" rel="noopener noreferrer">
              <FileText className="h-3.5 w-3.5" />
              Mở HĐ
            </a>
          </Button>
        )}

        <Button
          size="sm"
          variant="ghost"
          className="ml-auto gap-1.5 text-muted-foreground"
          onClick={handleSkip}
          disabled={!!busy}
        >
          {busy === "skip" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />}
          Bỏ qua
        </Button>
      </div>

      {tscdLine && (
        <TscdConfirmDialog
          open={tscdOpen}
          onOpenChange={setTscdOpen}
          amount={tscdLine.debit}
          description={tscdLine.memo ?? entries[0]?.description}
          suggestedKind={tscdKind}
          suggestedYears={tscdKind === "intangible" ? 3 : 5}
          busy={busy === "approve"}
          onConfirm={(r) => doApprove({ tscd: r })}
        />
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
function KindChipPopover({
  currentAccount,
  onPick,
}: {
  currentAccount: string;
  onPick: (opt: (typeof KIND_OPTIONS)[number]) => void;
}) {
  const current = KIND_OPTIONS.find((o) => currentAccount.startsWith(o.account.slice(0, 3))) ?? KIND_OPTIONS[0];
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className="inline-flex items-center gap-0.5 rounded px-1.5 py-0 text-[10px] font-medium border border-border/60 bg-background hover:bg-muted transition-colors"
          title="Đổi loại mặt hàng"
        >
          <AccountKindBadge code={currentAccount} className="border-0 bg-transparent px-0" />
          <ChevronDown className="h-2.5 w-2.5 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-1.5">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground px-2 py-1">
          Đổi loại mặt hàng
        </div>
        {KIND_OPTIONS.map((opt) => {
          const active = opt.key === current.key;
          return (
            <button
              key={opt.key}
              onClick={() => onPick(opt)}
              className={cn(
                "w-full text-left px-2 py-1.5 text-xs rounded hover:bg-muted transition-colors flex items-center gap-2",
                active && "bg-muted",
              )}
            >
              <span className="font-mono font-semibold w-10 text-muted-foreground">{opt.account}</span>
              <span className="flex-1">
                <div>{opt.label}</div>
                <div className="text-[10px] text-muted-foreground">{opt.hint}</div>
              </span>
              {active && <Check className="h-3 w-3 text-primary" />}
            </button>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}
