import { Check, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BulkRunUpdate } from "./types";

export function BulkRunCard({ update }: { update: BulkRunUpdate }) {
  const pct = update.total > 0 ? Math.round((update.done / update.total) * 100) : 0;
  return (
    <div className="rounded-2xl border border-border/60 bg-card/60 p-4 backdrop-blur-sm">
      <div className="mb-2 flex items-center justify-between text-sm">
        <div className="flex items-center gap-2 font-semibold">
          {update.finished ? (
            <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" strokeWidth={3} />
          ) : (
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
          )}
          {update.finished ? "Đã chạy xong" : "Đang chạy kế hoạch…"}
        </div>
        <div className="font-mono text-xs text-muted-foreground">
          {update.done}/{update.total} mục
          {update.etaSec != null && !update.finished && update.etaSec > 0
            ? ` · còn ~${update.etaSec >= 60 ? `${Math.round(update.etaSec / 60)} phút` : `${update.etaSec}s`}`
            : ""}
        </div>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full bg-primary transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
      {update.recent.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs">
          {update.recent.slice(-4).map((r, i) => (
            <li key={i} className="flex items-center gap-2">
              {r.status === "ok" ? (
                <Check className="h-3 w-3 text-emerald-600 dark:text-emerald-400" strokeWidth={3} />
              ) : r.status === "fail" ? (
                <X className="h-3 w-3 text-rose-600 dark:text-rose-400" />
              ) : (
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
              )}
              <span className={cn("flex-1 truncate font-mono", r.status === "fail" && "text-rose-600 dark:text-rose-400")}>
                {r.filename}
              </span>
              {r.message && <span className="truncate text-muted-foreground">{r.message}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
