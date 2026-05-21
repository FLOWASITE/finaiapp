import { Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ParsePhase } from "./types";

const DEFAULT_PHASES: { name: ParsePhase["name"]; label: string }[] = [
  { name: "ocr", label: "OCR & đọc nội dung" },
  { name: "extract", label: "Trích xuất trường thông tin" },
  { name: "partner_match", label: "Khớp đối tác với danh bạ" },
  { name: "rules_check", label: "Đối chiếu với quy tắc trong Trí nhớ AI" },
];

function fmtMs(ms: number | null | undefined): string {
  if (ms == null) return "";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function ParseProgressCard({
  phases,
  streaming,
  filename,
}: {
  phases?: ParsePhase[] | null;
  streaming?: boolean;
  filename?: string;
}) {
  const list: { label: string; ms: number | null; done: boolean }[] = phases?.length
    ? phases.map((p) => ({ label: p.label, ms: p.ms, done: !streaming }))
    : DEFAULT_PHASES.map((p, i) => ({
        label: p.label,
        ms: null,
        // While streaming with no phases yet: animate top-to-bottom
        done: !streaming && i < 99,
      }));

  return (
    <div className="rounded-2xl border border-border/60 bg-card/60 p-4 backdrop-blur-sm">
      <div className="mb-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {streaming ? "Đang xử lý hoá đơn…" : "Đã xử lý xong"}
        {filename && <span className="ml-1 normal-case text-muted-foreground/70"> · {filename}</span>}
      </div>
      <ul className="space-y-2">
        {list.map((p, i) => {
          const active = streaming && i === list.findIndex((x) => !x.done);
          return (
            <li key={p.label} className="flex items-center gap-3 text-sm">
              <span
                className={cn(
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
                  p.done
                    ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                    : active
                      ? "bg-primary/15 text-primary"
                      : "bg-muted text-muted-foreground/50",
                )}
              >
                {p.done ? (
                  <Check className="h-3 w-3" strokeWidth={3} />
                ) : active ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <span className="h-1.5 w-1.5 rounded-full bg-current" />
                )}
              </span>
              <span className={cn("flex-1", !p.done && !active && "text-muted-foreground/60")}>
                {p.label}
              </span>
              {p.ms != null && (
                <span className="font-mono text-[11px] text-muted-foreground">{fmtMs(p.ms)}</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
