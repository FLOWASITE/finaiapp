import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, AlertCircle, Loader2, FileText, Sparkles, ArrowRight } from "lucide-react";
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
  /** "skip" — exclude file from continuation; "continue" — proceed with selected sub-options */
  action: "continue" | "skip";
  /** Selected bank_account_id (for bank_statement) */
  bankAccountId?: string | null;
  /** Whether to include rows flagged as duplicate in DB (default false → skip) */
  includeOverlapDup?: boolean;
};

export function ParseProgressDialog({
  open,
  phase,
  files,
  onContinue,
  onClose,
  continueLabel = "Xem lại & chỉnh sửa",
  classifications,
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

  const continuingCount = classifications
    ? classifications.filter((_, i) => decisions?.[i]?.action !== "skip").length
    : doneCount;

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
              ? `Pha 1/3 — AI đang đọc và cấu trúc hoá dữ liệu (${doneCount}/${total} xong${errorCount ? `, ${errorCount} lỗi` : ""})`
              : phase === "classifying"
                ? `Pha 2/3 — Kiểm tra TK ngân hàng, file trùng, hoá đơn đã có, giao dịch lặp. Chọn hành động cho từng file rồi tiếp tục.`
                : `Pha 3/3 — Đã trích xuất ${doneCount}/${total} chứng từ. Mở trang xem lại để chỉnh sửa MST, số tiền, TK Nợ/Có trước khi ghi sổ.`}
          </DialogDescription>
        </DialogHeader>

        {phase !== "classifying" && (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Tiến trình tổng</span>
              <span className="font-medium">{overall}%</span>
            </div>
            <Progress value={overall} className="h-2" />
          </div>
        )}

        <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
          {phase === "classifying" && classifications
            ? classifications.map((c, i) => (
                <ClassifyRow
                  key={`${c.filename}-${i}`}
                  c={c}
                  decision={decisions?.[i] ?? { action: c.suggested_action }}
                  onDecisionChange={(patch) => onDecisionChange?.(i, patch)}
                  onCreateBankAccount={(meta) => onCreateBankAccount?.(i, meta)}
                />
              ))
            : files.map((f, i) => <FileRow key={`${f.name}-${i}`} file={f} />)}
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

function ClassifyRow({
  c,
  decision,
  onDecisionChange,
  onCreateBankAccount,
}: {
  c: ClassificationResult;
  decision: ClassifyDecision;
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
          <div className="flex items-center gap-2">
            <span className="truncate font-medium">{c.filename}</span>
            <Badge variant="outline" className="text-[10px]">{KIND_LABEL[c.kind] ?? c.kind}</Badge>
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
            Tiếp tục
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
