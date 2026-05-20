import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2,
  AlertCircle,
  Loader2,
  FileText,
  Sparkles,
  ArrowRight,
  ChevronDown,
  ChevronRight,
  Copy,
  Receipt,
  Landmark,
  ShieldCheck,
  Ban,
  Circle,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type FilePhase =
  | "queued"
  | "reading"
  | "parsing"
  | "structuring"
  | "done"
  | "error";

export type FileProgress = {
  name: string;
  phase: FilePhase;
  error?: string;
  parserUsed?: string;
  pages?: number;
  ms?: number;
};

const PHASE_LABEL: Record<FilePhase, string> = {
  queued: "Đang chờ",
  reading: "Đọc file",
  parsing: "Trích xuất nội dung (LlamaParse)",
  structuring: "Cấu trúc hoá dữ liệu (AI)",
  done: "Hoàn tất",
  error: "Lỗi",
};

const PHASE_PCT: Record<FilePhase, number> = {
  queued: 0,
  reading: 15,
  parsing: 55,
  structuring: 85,
  done: 100,
  error: 100,
};

const STEPS: { key: FilePhase; label: string }[] = [
  { key: "reading", label: "Đọc" },
  { key: "parsing", label: "Trích xuất" },
  { key: "structuring", label: "Cấu trúc" },
  { key: "done", label: "Xong" },
];

function stepStatus(current: FilePhase, step: FilePhase): "done" | "active" | "pending" | "error" {
  if (current === "error") {
    const order = ["queued", "reading", "parsing", "structuring", "done"];
    return order.indexOf(step) <= order.indexOf("parsing") ? "error" : "pending";
  }
  const order: FilePhase[] = ["queued", "reading", "parsing", "structuring", "done"];
  const ci = order.indexOf(current);
  const si = order.indexOf(step);
  if (si < ci) return "done";
  if (si === ci) return "active";
  return "pending";
}

export type Phase = "parsing" | "classifying" | "ready";

export type ClassificationWarning = {
  type: string;
  severity: "info" | "warn" | "error";
  message: string;
  meta?: any;
};

export type ClassificationResult = {
  filename: string;
  kind: string;
  warnings: ClassificationWarning[];
  bank_account_match?: { id: string; name: string; account_no: string; bank_name?: string | null } | null;
  bank_account_candidates?: Array<{ id: string; name: string; account_no: string; bank_name?: string | null }>;
  txn_overlap?: {
    total: number;
    duplicate_count: number;
    duplicate_indices: number[];
    period_from: string;
    period_to: string;
  };
  invoice_duplicate?: any;
  voucher_duplicate?: any;
  suggested_action: "continue" | "skip";
};

export type ClassifyDecision = {
  action: "continue" | "skip";
  bankAccountId?: string | null;
  includeOverlapDup?: boolean;
};

type Bucket = "file_dup" | "invoice_dup" | "bank_unknown" | "txn_overlap" | "ok";
type FilterKey = "all" | "ok" | "dup" | "bank" | "skipped";

const BUCKET_META: Record<Bucket, { label: string; icon: any; tone: string }> = {
  file_dup: { label: "Trùng file đã upload", icon: Copy, tone: "text-amber-600 dark:text-amber-400" },
  invoice_dup: { label: "Đã có trong sổ", icon: Receipt, tone: "text-amber-600 dark:text-amber-400" },
  bank_unknown: { label: "TK ngân hàng chưa khớp", icon: Landmark, tone: "text-amber-600 dark:text-amber-400" },
  txn_overlap: { label: "Có giao dịch trùng", icon: AlertCircle, tone: "text-amber-600 dark:text-amber-400" },
  ok: { label: "Sẵn sàng", icon: ShieldCheck, tone: "text-emerald-600 dark:text-emerald-400" },
};

function classifyBucket(c: ClassificationResult): Bucket {
  if (c.warnings?.some((w) => w.type === "file_duplicate")) return "file_dup";
  if (c.warnings?.some((w) => w.type === "invoice_duplicate" || w.type === "voucher_duplicate")) return "invoice_dup";
  if (c.warnings?.some((w) => w.type === "bank_account_unknown")) return "bank_unknown";
  if (c.txn_overlap && c.txn_overlap.duplicate_count > 0) return "txn_overlap";
  return "ok";
}

function isAutoSkipped(c: ClassificationResult, d: ClassifyDecision) {
  return d.action === "skip" && c.warnings?.some((w) => w.type === "file_duplicate");
}

function fmtSec(ms: number) {
  if (!isFinite(ms) || ms < 0) return "—";
  const s = ms / 1000;
  return s < 10 ? s.toFixed(1) + "s" : Math.round(s) + "s";
}

export function ParseProgressDialog({
  open,
  phase,
  files,
  onContinue,
  onClose,
  continueLabel = "Xem lại & chỉnh sửa",
  classifications,
  uploadIds,
  decisions,
  onDecisionChange,
  onCreateBankAccount,
}: {
  open: boolean;
  phase: Phase;
  files: FileProgress[];
  onContinue?: () => void;
  onClose?: () => void;
  continueLabel?: string;
  classifications?: ClassificationResult[];
  uploadIds?: (string | null)[];
  decisions?: Record<number, ClassifyDecision>;
  onDecisionChange?: (idx: number, patch: Partial<ClassifyDecision>) => void;
  onCreateBankAccount?: (idx: number, meta: any) => void;
}) {
  const total = files.length;
  const doneCount = files.filter((f) => f.phase === "done").length;
  const errorCount = files.filter((f) => f.phase === "error").length;
  const overall = total === 0 ? 0 : Math.round(
    files.reduce((s, f) => s + PHASE_PCT[f.phase], 0) / total,
  );

  // ─── Timing / ETA ───────────────────────────────────────────────
  const phaseStartRef = useRef<{ parsing?: number; classifying?: number; ready?: number }>({});
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (open && phase && !phaseStartRef.current[phase]) {
      phaseStartRef.current[phase] = Date.now();
    }
    if (!open) {
      phaseStartRef.current = {};
    }
  }, [open, phase]);
  useEffect(() => {
    if (!open || phase !== "parsing") return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [open, phase]);

  const parsingStarted = phaseStartRef.current.parsing;
  const elapsedMs = parsingStarted ? now - parsingStarted : 0;
  const speed = elapsedMs > 0 ? doneCount / (elapsedMs / 1000) : 0;
  const etaMs = speed > 0 && total > doneCount ? ((total - doneCount) / speed) * 1000 : 0;

  const totalReadyMs = useMemo(() => files.reduce((s, f) => s + (f.ms ?? 0), 0), [files]);
  const avgMs = doneCount > 0 ? totalReadyMs / doneCount : 0;

  // ─── Classify summary buckets ───────────────────────────────────
  const buckets = useMemo(() => {
    const out: Record<Bucket, number[]> = { file_dup: [], invoice_dup: [], bank_unknown: [], txn_overlap: [], ok: [] };
    classifications?.forEach((c, i) => {
      out[classifyBucket(c)].push(i);
    });
    return out;
  }, [classifications]);

  const autoSkippedIdx = useMemo(() => {
    if (!classifications) return [] as number[];
    return classifications
      .map((c, i) => (isAutoSkipped(c, decisions?.[i] ?? { action: c.suggested_action }) ? i : -1))
      .filter((x) => x >= 0);
  }, [classifications, decisions]);

  const warnCount = useMemo(
    () => (classifications ?? []).reduce((s, c) => s + (c.warnings?.filter((w) => w.severity === "warn").length ?? 0), 0),
    [classifications],
  );
  const errCount = useMemo(
    () => (classifications ?? []).reduce((s, c) => s + (c.warnings?.filter((w) => w.severity === "error").length ?? 0), 0),
    [classifications],
  );

  const [filter, setFilter] = useState<FilterKey>("all");
  const [openBuckets, setOpenBuckets] = useState<Record<Bucket, boolean>>({
    file_dup: true, invoice_dup: true, bank_unknown: true, txn_overlap: true, ok: false,
  });

  const visibleBucket = (b: Bucket, idxs: number[]) => {
    if (filter === "all") return idxs;
    if (filter === "skipped") return idxs.filter((i) => decisions?.[i]?.action === "skip");
    if (filter === "ok") return b === "ok" ? idxs : [];
    if (filter === "dup") return b === "file_dup" || b === "invoice_dup" || b === "txn_overlap" ? idxs : [];
    if (filter === "bank") return b === "bank_unknown" ? idxs : [];
    return idxs;
  };

  const continuingCount = classifications
    ? classifications.filter((_, i) => decisions?.[i]?.action !== "skip").length
    : doneCount;

  // ─── 3-phase stepper ────────────────────────────────────────────
  const PHASES: Array<{ key: Phase; label: string }> = [
    { key: "parsing", label: "Trích xuất" },
    { key: "classifying", label: "Phân loại" },
    { key: "ready", label: "Sẵn sàng" },
  ];
  const currentIdx = PHASES.findIndex((p) => p.key === phase);

  const bulkSet = (idxs: number[], action: "continue" | "skip") => {
    idxs.forEach((i) => onDecisionChange?.(i, { action }));
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose?.()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {phase === "parsing" ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                Đang xử lý chứng từ…
              </>
            ) : phase === "classifying" ? (
              <>
                <Sparkles className="h-5 w-5 text-amber-500" />
                Phân loại & đối chiếu
              </>
            ) : (
              <>
                <Sparkles className="h-5 w-5 text-emerald-500" />
                Sẵn sàng xem lại
              </>
            )}
          </DialogTitle>
          <DialogDescription>
            {phase === "parsing"
              ? `Pha 1/3 — AI đang đọc và cấu trúc hoá dữ liệu`
              : phase === "classifying"
                ? `Pha 2/3 — Kiểm tra TK ngân hàng, file trùng, hoá đơn đã có`
                : `Pha 3/3 — Mở trang xem lại để chỉnh sửa trước khi ghi sổ`}
          </DialogDescription>
        </DialogHeader>

        {/* Stepper */}
        <div className="flex items-center gap-1.5 px-1">
          {PHASES.map((p, i) => {
            const st = i < currentIdx ? "done" : i === currentIdx ? "active" : "pending";
            return (
              <div key={p.key} className="flex flex-1 items-center gap-1.5">
                <div
                  className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                    st === "done" && "border-emerald-500 bg-emerald-500/10 text-emerald-600",
                    st === "active" && "border-primary bg-primary/10 text-primary",
                    st === "pending" && "border-border bg-muted text-muted-foreground",
                  )}
                >
                  {st === "done" ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : st === "active" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Circle className="h-3 w-3" />
                  )}
                </div>
                <span
                  className={cn(
                    "text-xs font-medium whitespace-nowrap",
                    st === "done" && "text-emerald-600",
                    st === "active" && "text-primary",
                    st === "pending" && "text-muted-foreground",
                  )}
                >
                  {p.label}
                </span>
                {i < PHASES.length - 1 && (
                  <div className="relative mx-1 h-0.5 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn(
                        "absolute inset-y-0 left-0 transition-all duration-500",
                        i < currentIdx ? "w-full bg-emerald-500" : i === currentIdx ? "w-1/2 bg-primary" : "w-0",
                      )}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Metrics */}
        {phase === "parsing" && total > 0 && (
          <div className="space-y-1">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span>
                <b className="text-foreground">{doneCount}/{total}</b> xong
                {errorCount > 0 && <span className="text-destructive"> · {errorCount} lỗi</span>}
              </span>
              <span className="flex items-center gap-3 tabular-nums">
                <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {fmtSec(elapsedMs)}</span>
                {etaMs > 0 && <span>~{fmtSec(etaMs)} còn lại</span>}
                {speed > 0 && <span>{speed.toFixed(1)} file/s</span>}
                <span className="font-medium text-foreground">{overall}%</span>
              </span>
            </div>
            <Progress value={overall} className="h-2" />
          </div>
        )}

        {phase === "ready" && total > 0 && (
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span><b className="text-emerald-600">{doneCount}</b> chứng từ sẵn sàng{errorCount > 0 && <span className="text-destructive"> · {errorCount} lỗi</span>}</span>
            {totalReadyMs > 0 && (
              <span className="tabular-nums">Tổng {fmtSec(totalReadyMs)} · TB {fmtSec(avgMs)}/file</span>
            )}
          </div>
        )}

        {/* Classify summary chips */}
        {phase === "classifying" && classifications && classifications.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 rounded-lg border bg-muted/30 p-2">
            <SummaryChip
              active={filter === "all"}
              onClick={() => setFilter("all")}
              label={`Tất cả ${classifications.length}`}
              tone="default"
            />
            {buckets.ok.length > 0 && (
              <SummaryChip
                active={filter === "ok"}
                onClick={() => setFilter("ok")}
                label={`✓ ${buckets.ok.length} OK`}
                tone="emerald"
              />
            )}
            {(buckets.file_dup.length + buckets.invoice_dup.length + buckets.txn_overlap.length) > 0 && (
              <SummaryChip
                active={filter === "dup"}
                onClick={() => setFilter("dup")}
                label={`⚠ ${buckets.file_dup.length + buckets.invoice_dup.length + buckets.txn_overlap.length} trùng`}
                tone="amber"
              />
            )}
            {buckets.bank_unknown.length > 0 && (
              <SummaryChip
                active={filter === "bank"}
                onClick={() => setFilter("bank")}
                label={`⚠ ${buckets.bank_unknown.length} cần TK`}
                tone="amber"
              />
            )}
            {autoSkippedIdx.length > 0 && (
              <SummaryChip
                active={filter === "skipped"}
                onClick={() => setFilter("skipped")}
                label={`⊘ ${autoSkippedIdx.length} đã bỏ qua`}
                tone="muted"
              />
            )}
            <span className="ml-auto text-[11px] text-muted-foreground">
              {warnCount > 0 && <span>{warnCount} cảnh báo</span>}
              {errCount > 0 && <span className="text-destructive"> · {errCount} chặn</span>}
            </span>
          </div>
        )}

        <div className="max-h-[420px] space-y-3 overflow-y-auto pr-1">
          {phase === "classifying" && classifications ? (
            (["file_dup", "invoice_dup", "bank_unknown", "txn_overlap", "ok"] as Bucket[]).map((b) => {
              const idxs = visibleBucket(b, buckets[b]);
              if (idxs.length === 0) return null;
              const meta = BUCKET_META[b];
              const Icon = meta.icon;
              const isOpen = openBuckets[b];
              return (
                <section key={b} className="rounded-lg border bg-card/30">
                  <header className="flex items-center gap-2 px-3 py-2">
                    <button
                      type="button"
                      onClick={() => setOpenBuckets((s) => ({ ...s, [b]: !s[b] }))}
                      className="flex items-center gap-1.5 text-sm font-medium"
                    >
                      {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      <Icon className={cn("h-4 w-4", meta.tone)} />
                      <span>{meta.label}</span>
                      <Badge variant="secondary" className="text-[10px]">{idxs.length}</Badge>
                    </button>
                    {b !== "ok" && (
                      <div className="ml-auto flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => bulkSet(idxs, "skip")}
                          className="rounded border border-border px-2 py-0.5 text-[10px] hover:bg-muted"
                        >
                          <Ban className="mr-0.5 inline h-3 w-3" />Bỏ qua tất cả
                        </button>
                        <button
                          type="button"
                          onClick={() => bulkSet(idxs, "continue")}
                          className="rounded border border-border px-2 py-0.5 text-[10px] hover:bg-muted"
                        >
                          Tiếp tục tất cả
                        </button>
                      </div>
                    )}
                  </header>
                  {isOpen && (
                    <div className="space-y-2 p-2 pt-0">
                      {idxs.map((i) => {
                        const c = classifications[i];
                        const d = decisions?.[i] ?? { action: c.suggested_action };
                        return (
                          <ClassifyRow
                            key={`${c.filename}-${i}`}
                            c={c}
                            decision={d}
                            autoSkipped={isAutoSkipped(c, d)}
                            onDecisionChange={(patch) => onDecisionChange?.(i, patch)}
                            onCreateBankAccount={(meta) => onCreateBankAccount?.(i, meta)}
                          />
                        );
                      })}
                    </div>
                  )}
                </section>
              );
            })
          ) : (
            <div className="space-y-2">
              {files.map((f, i) => <FileRow key={`${f.name}-${i}`} file={f} />)}
            </div>
          )}

          {phase === "classifying" && classifications &&
            (["file_dup", "invoice_dup", "bank_unknown", "txn_overlap", "ok"] as Bucket[]).every(
              (b) => visibleBucket(b, buckets[b]).length === 0,
            ) && (
              <div className="rounded-lg border border-dashed py-8 text-center text-xs text-muted-foreground">
                Không có file trong bộ lọc này.
              </div>
            )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          {phase === "parsing" ? (
            <Button variant="ghost" disabled>
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              Đang xử lý…
            </Button>
          ) : phase === "classifying" ? (
            <>
              <Button variant="ghost" onClick={onClose}>Huỷ</Button>
              <Button onClick={onContinue} disabled={continuingCount === 0}>
                Tiếp tục ({continuingCount} file)
                <ArrowRight className="ml-1.5 h-4 w-4" />
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={onClose}>Đóng</Button>
              <Button onClick={onContinue} disabled={doneCount === 0}>
                {continueLabel}
                <ArrowRight className="ml-1.5 h-4 w-4" />
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SummaryChip({
  label,
  active,
  onClick,
  tone,
}: {
  label: string;
  active?: boolean;
  onClick?: () => void;
  tone: "default" | "emerald" | "amber" | "muted";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition",
        !active && "border-border bg-background hover:bg-muted",
        active && tone === "default" && "border-primary bg-primary text-primary-foreground",
        active && tone === "emerald" && "border-emerald-500 bg-emerald-500 text-white",
        active && tone === "amber" && "border-amber-500 bg-amber-500 text-white",
        active && tone === "muted" && "border-muted-foreground/40 bg-muted-foreground/20",
        !active && tone === "emerald" && "text-emerald-700 dark:text-emerald-400",
        !active && tone === "amber" && "text-amber-700 dark:text-amber-400",
      )}
    >
      {label}
    </button>
  );
}

function ClassifyRow({
  c,
  decision,
  autoSkipped,
  onDecisionChange,
  onCreateBankAccount,
}: {
  c: ClassificationResult;
  decision: ClassifyDecision;
  autoSkipped?: boolean;
  onDecisionChange: (patch: Partial<ClassifyDecision>) => void;
  onCreateBankAccount: (meta: any) => void;
}) {
  const skipped = decision.action === "skip";
  const KIND_LABEL: Record<string, string> = {
    purchase_invoice: "Hoá đơn mua",
    bank_statement: "Sao kê NH",
    cash_voucher: "Phiếu thu/chi",
    unknown: "Không rõ",
  };
  return (
    <div
      className={cn(
        "rounded-lg border p-3 transition-opacity",
        skipped ? "border-border bg-muted/20 opacity-60" : "border-border bg-card/40",
      )}
    >
      <div className="flex items-start gap-2 text-sm">
        <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="truncate font-medium">{c.filename}</span>
            <Badge variant="outline" className="text-[10px]">{KIND_LABEL[c.kind] ?? c.kind}</Badge>
            {autoSkipped && (
              <Badge variant="secondary" className="text-[10px]">Đã tự bỏ qua</Badge>
            )}
          </div>
          {c.bank_account_match && (
            <div className="mt-1 text-xs text-emerald-700 dark:text-emerald-400">
              ✓ Khớp TK: <b>{c.bank_account_match.name}</b> · {c.bank_account_match.account_no}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className={cn(
              "rounded border px-2 py-0.5 text-[11px] transition",
              !skipped ? "border-primary bg-primary text-primary-foreground" : "border-border",
            )}
            onClick={() => onDecisionChange({ action: "continue" })}
          >
            {autoSkipped && skipped ? "Khôi phục" : "Tiếp tục"}
          </button>
          <button
            type="button"
            className={cn(
              "rounded border px-2 py-0.5 text-[11px] transition",
              skipped ? "border-destructive bg-destructive text-destructive-foreground" : "border-border",
            )}
            onClick={() => onDecisionChange({ action: "skip" })}
          >
            Bỏ qua
          </button>
        </div>
      </div>

      {c.warnings.length > 0 && (
        <ul className="mt-2 space-y-1">
          {c.warnings.map((w, j) => (
            <li
              key={j}
              className={cn(
                "rounded border px-2 py-1.5 text-xs",
                w.severity === "error" && "border-destructive/40 bg-destructive/5 text-destructive",
                w.severity === "warn" && "border-amber-500/40 bg-amber-500/5 text-amber-800 dark:text-amber-300",
                w.severity === "info" && "border-border bg-muted/30 text-muted-foreground",
              )}
            >
              <div className="flex items-start gap-2">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <div className="flex-1">{w.message}</div>
                {w.type === "bank_account_unknown" && w.meta?.account_no && (
                  <button
                    type="button"
                    onClick={() => onCreateBankAccount(w.meta)}
                    className="rounded border border-current px-2 py-0.5 text-[10px] hover:bg-current/10"
                  >
                    Tạo TK mới
                  </button>
                )}
                {(w.type === "invoice_duplicate" || w.type === "voucher_duplicate") && w.meta?.id && (
                  <a
                    href={`/purchases/${w.meta.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded border border-current px-2 py-0.5 text-[10px] hover:bg-current/10"
                  >
                    Mở phiếu cũ
                  </a>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {c.txn_overlap && c.txn_overlap.duplicate_count > 0 && !skipped && (
        <label className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
          <input
            type="checkbox"
            checked={!!decision.includeOverlapDup}
            onChange={(e) => onDecisionChange({ includeOverlapDup: e.target.checked })}
          />
          Ghi đè cả {c.txn_overlap.duplicate_count} GD đã có trong sổ (mặc định bỏ tick)
        </label>
      )}
    </div>
  );
}

function FileRow({ file }: { file: FileProgress }) {
  const pct = PHASE_PCT[file.phase];
  const isActive = file.phase !== "done" && file.phase !== "error" && file.phase !== "queued";
  return (
    <div className="rounded-lg border border-border bg-card/40 p-3">
      <div className="flex items-center gap-2 text-sm">
        <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className="truncate font-medium">{file.name}</span>
        <div className="ml-auto flex items-center gap-2">
          {file.parserUsed && (
            <Badge variant="outline" className="text-[10px] font-mono">{file.parserUsed}</Badge>
          )}
          {file.pages != null && (
            <Badge variant="secondary" className="text-[10px]">{file.pages}p</Badge>
          )}
          {file.phase === "done" && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
          {file.phase === "error" && <AlertCircle className="h-4 w-4 text-destructive" />}
          {isActive && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
        </div>
      </div>

      <div className="mt-2 flex items-center gap-1.5">
        {STEPS.map((s, i) => {
          const st = stepStatus(file.phase, s.key);
          return (
            <div key={s.key} className="flex flex-1 items-center gap-1.5">
              <div
                className={cn(
                  "h-1.5 flex-1 rounded-full transition-colors",
                  st === "done" && "bg-emerald-500",
                  st === "active" && "bg-primary animate-pulse",
                  st === "pending" && "bg-muted",
                  st === "error" && "bg-destructive",
                )}
              />
              {i === STEPS.length - 1 && (
                <span
                  className={cn(
                    "text-[10px] tabular-nums",
                    st === "done" ? "text-emerald-600" : "text-muted-foreground",
                  )}
                >
                  {pct}%
                </span>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-1.5 flex items-center justify-between text-[11px]">
        <span
          className={cn(
            "text-muted-foreground",
            file.phase === "error" && "text-destructive",
            file.phase === "done" && "text-emerald-600",
          )}
        >
          {file.phase === "error" ? (file.error || "Lỗi không xác định") : PHASE_LABEL[file.phase]}
        </span>
        {file.ms != null && file.phase === "done" && (
          <span className="text-muted-foreground tabular-nums">{(file.ms / 1000).toFixed(1)}s</span>
        )}
      </div>
    </div>
  );
}
