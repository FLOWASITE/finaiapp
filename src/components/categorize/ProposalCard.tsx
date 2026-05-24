import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { Check, AlertTriangle, Sparkles, XCircle, Loader2, FileText, Pencil, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { approveProposal, skipProposal } from "@/lib/categorize.functions";
import type { JournalProposalDTO, ProposalEntry, ProposalLine } from "@/lib/categorize/types";

const SOURCE_LABEL: Record<string, { label: string; tone: string }> = {
  vendor_template: { label: "Mẫu NCC", tone: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30" },
  learned_lines: { label: "Học từ memory", tone: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/30" },
  classify_rule: { label: "Luật phân loại", tone: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30" },
  ai_fallback: { label: "AI suy luận", tone: "bg-violet-500/10 text-violet-700 dark:text-violet-400 border-violet-500/30" },
  manual: { label: "Thủ công", tone: "bg-muted text-muted-foreground border-border" },
};

const fmt = (n: number) => new Intl.NumberFormat("vi-VN").format(n);

type Props = {
  proposalId: string;
  invoice: any | null;
  dto: JournalProposalDTO;
  confidence: number;
  source: string;
  onMutated?: () => void;
  selected?: boolean;
  onSelectChange?: (v: boolean) => void;
};

export function ProposalCard({ proposalId, invoice, dto, confidence, source, onMutated, selected, onSelectChange }: Props) {
  const approveFn = useServerFn(approveProposal);
  const skipFn = useServerFn(skipProposal);
  const qc = useQueryClient();
  const [busy, setBusy] = useState<"approve" | "skip" | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [edit, setEdit] = useState(false);
  const [entries, setEntries] = useState<ProposalEntry[]>(dto.entries);

  const src = SOURCE_LABEL[source] ?? SOURCE_LABEL.manual;
  const confPct = Math.round(confidence * 100);
  const hasError = dto.warnings.some((w) => w.severity === "error");
  const supplier = invoice?.supplier_name ?? "(Không rõ NCC)";
  const total = Number(invoice?.total ?? 0);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["categorize", "proposals"] });
    qc.invalidateQueries({ queryKey: ["sidebar", "ai-counts"] });
    onMutated?.();
  };

  const handleApprove = async () => {
    setBusy("approve");
    try {
      const dirty = edit && JSON.stringify(entries) !== JSON.stringify(dto.entries);
      await approveFn({
        data: {
          proposal_id: proposalId,
          entry_index: 0,
          ...(dirty ? { edits: { description: entries[0].description, entry_date: entries[0].entry_date, lines: entries[0].lines } } : {}),
        },
      });
      toast.success("Đã ghi sổ bút toán");
      refresh();
    } catch (e: any) {
      toast.error(e?.message || "Không duyệt được");
    } finally {
      setBusy(null);
    }
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

  const updateLine = (entryIdx: number, lineIdx: number, patch: Partial<ProposalLine>) => {
    setEntries((prev) => {
      const next = prev.map((e, i) => (i !== entryIdx ? e : {
        ...e,
        lines: e.lines.map((l, j) => (j !== lineIdx ? l : { ...l, ...patch })),
      }));
      return next;
    });
  };

  return (
    <div className={cn(
      "rounded-2xl border bg-card transition-all",
      hasError ? "border-destructive/40" : "border-border/60",
      selected && "ring-2 ring-primary/40",
    )}>
      {/* Header */}
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
            <span className="font-semibold truncate">{supplier}</span>
            {invoice?.invoice_no && (
              <span className="text-xs text-muted-foreground font-mono">#{invoice.invoice_no}</span>
            )}
            <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", src.tone)}>{src.label}</Badge>
            <Badge variant="outline" className={cn(
              "text-[10px] px-1.5 py-0",
              confPct >= 85 ? "border-emerald-500/30 text-emerald-700 dark:text-emerald-400" :
              confPct >= 60 ? "border-amber-500/30 text-amber-700 dark:text-amber-400" :
              "border-muted-foreground/30 text-muted-foreground",
            )}>{confPct}%</Badge>
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {invoice?.issue_date ?? "—"} · Tổng <span className="font-semibold text-foreground">{fmt(total)} ₫</span>
          </div>
        </div>
        <button
          onClick={() => setExpanded((v) => !v)}
          className="p-1 text-muted-foreground hover:text-foreground"
          aria-label="Mở rộng"
        >
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
      </div>

      {/* Entries */}
      <div className="px-4 pt-2 pb-3 space-y-3">
        {entries.map((entry, ei) => (
          <div key={ei} className="rounded-lg border border-border/60 bg-muted/20 p-3">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
              Bút toán {entries.length > 1 ? `${ei + 1}/${entries.length}` : ""} · {entry.description}
            </div>
            <table className="w-full font-mono text-[12px]">
              <tbody>
                {entry.lines.map((l, li) => (
                  <tr key={li} className="border-b border-border/30 last:border-0">
                    <td className="w-8 py-1 text-muted-foreground">{l.debit > 0 ? "Nợ" : "Có"}</td>
                    <td className="w-20 py-1">
                      {edit ? (
                        <Input
                          value={l.account_code}
                          onChange={(e) => updateLine(ei, li, { account_code: e.target.value })}
                          className="h-6 px-1 text-[12px] font-semibold w-16"
                        />
                      ) : (
                        <span className="font-semibold">{l.account_code}</span>
                      )}
                    </td>
                    <td className="py-1 text-muted-foreground truncate max-w-[280px]">{l.memo ?? ""}</td>
                    <td className="py-1 text-right font-semibold">
                      {edit ? (
                        <Input
                          type="number"
                          value={l.debit > 0 ? l.debit : l.credit}
                          onChange={(e) => {
                            const v = Number(e.target.value) || 0;
                            updateLine(ei, li, l.debit > 0 ? { debit: v } : { credit: v });
                          }}
                          className="h-6 px-1 text-[12px] text-right w-28 ml-auto"
                        />
                      ) : (
                        fmt(l.debit > 0 ? l.debit : l.credit)
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>

      {/* Warnings — sort error > warn > info */}
      {dto.warnings.length > 0 && (
        <div className="px-4 pb-3 space-y-1.5">
          {[...dto.warnings]
            .sort((a, b) => {
              const o: Record<string, number> = { error: 0, warn: 1, info: 2 };
              return (o[a.severity] ?? 3) - (o[b.severity] ?? 3);
            })
            .map((w, i) => (
              <div key={i} className={cn(
                "flex gap-2 rounded-md border px-2.5 py-1.5 text-xs",
                w.severity === "error" ? "border-destructive/40 bg-destructive/10 text-destructive font-medium" :
                w.severity === "warn" ? "border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-400" :
                "border-border bg-muted/30 text-muted-foreground",
              )}>
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span className="flex-1">
                  <span className="font-mono text-[10px] uppercase mr-1">{w.code}</span>
                  {w.message}
                </span>
              </div>
            ))}
        </div>
      )}

      {/* Top-3 signals — luôn hiển thị để KTT thấy "vì sao AI đề xuất" */}
      {dto.signals.length > 0 && !expanded && (
        <div className="px-4 pb-3">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
            Vì sao AI đề xuất ({dto.signals.length} tín hiệu)
          </div>
          <div className="flex flex-wrap gap-1.5">
            {[...dto.signals]
              .sort((a, b) => b.weight - a.weight)
              .slice(0, 3)
              .map((s, i) => (
                <Badge key={i} variant="outline" className={cn(
                  "text-[10px] px-1.5 py-0 gap-1",
                  s.ok ? "border-emerald-500/30 text-emerald-700 dark:text-emerald-400" : "border-amber-500/30 text-amber-700 dark:text-amber-400",
                )}>
                  {s.ok ? <Check className="h-2.5 w-2.5" /> : <AlertTriangle className="h-2.5 w-2.5" />}
                  {s.label}
                  {s.weight > 0 && <span className="opacity-60">+{s.weight}</span>}
                </Badge>
              ))}
            {dto.signals.length > 3 && (
              <button
                onClick={() => setExpanded(true)}
                className="text-[10px] text-muted-foreground hover:text-foreground underline"
              >
                +{dto.signals.length - 3} tín hiệu khác
              </button>
            )}
          </div>
        </div>
      )}

      {/* Expanded: signals + rules */}
      {expanded && (
        <div className="px-4 pb-3 space-y-2 border-t border-border/40 pt-3">
          {dto.applied_rules.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              <Sparkles className="h-3 w-3 text-primary mt-0.5" />
              {dto.applied_rules.map((r, i) => (
                <Badge key={i} variant="outline" className="text-[10px] font-mono px-1.5 py-0">{r}</Badge>
              ))}
            </div>
          )}
          {dto.signals.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {dto.signals.map((s, i) => (
                <Badge key={i} variant="outline" className={cn(
                  "text-[10px] px-1.5 py-0",
                  s.ok ? "border-emerald-500/30 text-emerald-700 dark:text-emerald-400" : "border-muted-foreground/30 text-muted-foreground",
                )}>
                  {s.ok ? <Check className="h-2.5 w-2.5 mr-0.5" /> : null}
                  {s.label}
                </Badge>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2 border-t border-border/60 bg-muted/20 px-4 py-2.5">
        <Button size="sm" onClick={handleApprove} disabled={!!busy || hasError} className="gap-1.5">
          {busy === "approve" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" strokeWidth={3} />}
          Duyệt & ghi sổ
        </Button>
        <Button size="sm" variant="outline" onClick={() => setEdit((v) => !v)} disabled={!!busy} className="gap-1.5">
          <Pencil className="h-3.5 w-3.5" />
          {edit ? "Xong" : "Sửa"}
        </Button>
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
    </div>
  );
}
