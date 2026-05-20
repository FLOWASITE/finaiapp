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

export type Phase = "parsing" | "ready";

export function ParseProgressDialog({
  open,
  phase,
  files,
  onContinue,
  onClose,
  continueLabel = "Xem lại & chỉnh sửa",
}: {
  open: boolean;
  phase: Phase;
  files: FileProgress[];
  onContinue?: () => void;
  onClose?: () => void;
  continueLabel?: string;
}) {
  const total = files.length;
  const doneCount = files.filter((f) => f.phase === "done").length;
  const errorCount = files.filter((f) => f.phase === "error").length;
  const overall = total === 0 ? 0 : Math.round(
    files.reduce((s, f) => s + PHASE_PCT[f.phase], 0) / total,
  );

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
            ) : (
              <>
                <Sparkles className="h-5 w-5 text-emerald-500" />
                Sẵn sàng xem lại
              </>
            )}
          </DialogTitle>
          <DialogDescription>
            {phase === "parsing"
              ? `Pha 1/2 — AI đang đọc và cấu trúc hoá dữ liệu (${doneCount}/${total} xong${errorCount ? `, ${errorCount} lỗi` : ""})`
              : `Pha 2/2 — Đã trích xuất ${doneCount}/${total} chứng từ. Hãy mở trang xem lại để chỉnh sửa MST, số tiền, TK Nợ/Có trước khi ghi sổ.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Tiến trình tổng</span>
            <span className="font-medium">{overall}%</span>
          </div>
          <Progress value={overall} className="h-2" />
        </div>

        <div className="max-h-[360px] space-y-2 overflow-y-auto pr-1">
          {files.map((f, i) => (
            <FileRow key={`${f.name}-${i}`} file={f} />
          ))}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          {phase === "parsing" ? (
            <Button variant="ghost" disabled>
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              Đang xử lý…
            </Button>
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
