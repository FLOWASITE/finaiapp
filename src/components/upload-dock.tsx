import { useUploadQueue, summarizeJob, type UploadJob, type UploadItem } from "@/lib/upload-queue";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  ChevronDown,
  ChevronUp,
  CloudUpload,
  Loader2,
  CheckCircle2,
  XCircle,
  X,
  RotateCw,
  Ban,
  FileIcon,
} from "lucide-react";


function fmtEta(sec: number) {
  if (sec < 60) return `~${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `~${m}p${s > 0 ? ` ${s}s` : ""}`;
}

function ProgressTwoLayer({ pctDone, pctInflight }: { pctDone: number; pctInflight: number }) {
  return (
    <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div
        className="absolute inset-y-0 left-0 bg-primary/25 transition-all"
        style={{ width: `${pctInflight}%` }}
      />
      <div
        className="absolute inset-y-0 left-0 bg-primary transition-all"
        style={{ width: `${pctDone}%` }}
      />
    </div>
  );
}

function ItemRow({ job, item }: { job: UploadJob; item: UploadItem }) {
  const { retryItem } = useUploadQueue();
  return (
    <li className="flex items-center gap-2 px-3 py-1.5 text-xs">
      <FileIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <span className="flex-1 truncate" title={item.name}>{item.name}</span>
      <span className="shrink-0">
        {item.status === "pending" && (
          <span className="block h-1.5 w-1.5 rounded-full bg-muted-foreground/40" />
        )}
        {item.status === "uploading" && <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />}
        {item.status === "done" && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />}
        {item.status === "failed" && (
          <button
            title={item.message || "Lỗi — bấm để thử lại"}
            onClick={() => retryItem(job.id, item.id)}
            className="inline-flex items-center gap-1 text-destructive hover:underline"
          >
            <XCircle className="h-3.5 w-3.5" />
            <RotateCw className="h-3 w-3" />
          </button>
        )}
        {item.status === "rejected" && (
          <span title={item.message} className="inline-flex items-center gap-1 text-destructive">
            <Ban className="h-3.5 w-3.5" />
          </span>
        )}
      </span>
    </li>
  );
}

function JobCard({ job }: { job: UploadJob }) {
  const { dismiss } = useUploadQueue();
  const s = summarizeJob(job);
  const hasIssue = s.failed + s.rejected > 0;
  return (
    <div className="rounded-lg border bg-card">
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          {job.status === "running" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
          ) : hasIssue ? (
            <XCircle className="h-3.5 w-3.5 text-destructive" />
          ) : (
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
          )}
          <span className="text-xs font-medium">
            {job.status === "running" ? "Đang tải" : "Hoàn tất"} {s.finished}/{s.total}
          </span>
          <span className="text-[11px] text-muted-foreground tabular-nums">{s.pctDone}%</span>
          {s.etaSec != null && job.status === "running" && (
            <span className="text-[11px] text-muted-foreground">· còn {fmtEta(s.etaSec)}</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {s.done > 0 && (
            <Badge variant="secondary" className="h-4 px-1 text-[10px]">{s.done} ✓</Badge>
          )}
          {s.failed > 0 && (
            <Badge variant="destructive" className="h-4 px-1 text-[10px]">{s.failed} ✗</Badge>
          )}
          {s.rejected > 0 && (
            <Badge variant="destructive" className="h-4 px-1 text-[10px]">{s.rejected} 🚫</Badge>
          )}
          {job.status === "done" && (
            <button
              onClick={() => dismiss(job.id)}
              className="ml-1 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Đóng"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>
      <div className="px-3 pb-2">
        <ProgressTwoLayer pctDone={s.pctDone} pctInflight={s.pctInflight} />
      </div>
      <ul className="max-h-44 divide-y overflow-y-auto border-t">
        {job.items.map((it) => (
          <ItemRow key={it.id} job={job} item={it} />
        ))}
      </ul>

    </div>
  );
}

export function UploadDock() {
  const { jobs, dockOpen, setDockOpen, dockExpanded, setDockExpanded, dismissAllDone } =
    useUploadQueue();

  if (!dockOpen || jobs.length === 0) return null;

  // Aggregate across jobs
  const totals = jobs.reduce(
    (acc, j) => {
      const s = summarizeJob(j);
      acc.total += s.total;
      acc.finished += s.finished;
      acc.done += s.done;
      acc.failed += s.failed;
      acc.rejected += s.rejected;
      acc.running += j.status === "running" ? 1 : 0;
      return acc;
    },
    { total: 0, finished: 0, done: 0, failed: 0, rejected: 0, running: 0 },
  );
  const overallPct = totals.total === 0 ? 0 : Math.round((totals.finished / totals.total) * 100);
  const anyRunning = totals.running > 0;

  return (
    <motion.div
      initial={{ y: 40, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 40, opacity: 0 }}
      transition={{ type: "spring", stiffness: 280, damping: 26 }}
      className={cn(
        "fixed bottom-4 right-4 z-50 w-[360px] max-w-[calc(100vw-2rem)]",
        "rounded-xl border bg-background/95 shadow-2xl backdrop-blur-md",
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <div className="rounded-md bg-primary/10 p-1 text-primary">
          {anyRunning ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <CloudUpload className="h-3.5 w-3.5" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold">
            {anyRunning ? "Đang tải lên" : "Tải lên hoàn tất"}
          </div>
          <div className="text-[11px] text-muted-foreground">
            {totals.finished}/{totals.total} file · {overallPct}%
            {totals.failed + totals.rejected > 0 && (
              <span className="text-destructive"> · {totals.failed + totals.rejected} lỗi</span>
            )}
          </div>
        </div>
        <button
          onClick={() => setDockExpanded(!dockExpanded)}
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label={dockExpanded ? "Thu gọn" : "Mở rộng"}
        >
          {dockExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
        </button>
        <button
          onClick={() => setDockOpen(false)}
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Ẩn"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {dockExpanded ? (
        <div className="space-y-2 p-2">
          {jobs.map((j) => (
            <JobCard key={j.id} job={j} />
          ))}
          {jobs.some((j) => j.status === "done") && (
            <div className="flex justify-end px-1">
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={dismissAllDone}>
                Xoá các job đã xong
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="px-3 py-2">
          <ProgressTwoLayer pctDone={overallPct} pctInflight={overallPct} />
        </div>
      )}
    </motion.div>
  );
}
