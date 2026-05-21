import { Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ParsePhase } from "./types";

type PhaseName = "ocr" | "extract" | "partner_match" | "rules_check";

const DEFAULT_PHASES: { name: PhaseName; label: string }[] = [
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

type LivePhase = { name: string; status: "start" | "done"; ms?: number | null };

export function ParseProgressCard({
  phases,
  streaming,
  filename,
  livePhases,
}: {
  phases?: ParsePhase[] | null;
  streaming?: boolean;
  filename?: string;
  /** Realtime phase events streamed from the server while parsing is in-flight. */
  livePhases?: LivePhase[] | null;
}) {
  // Priority: final `phases` (after tool-result) > live streaming state > default skeleton.
  let list: { label: string; ms: number | null; done: boolean; active: boolean }[];

  if (phases?.length) {
    list = phases.map((p) => ({
      label: p.label,
      ms: p.ms,
      done: true,
      active: false,
    }));
  } else {
    // Build live state from incoming phase events
    const stateByName = new Map<string, { started: boolean; done: boolean; ms: number | null }>();
    for (const p of DEFAULT_PHASES) {
      stateByName.set(p.name, { started: false, done: false, ms: null });
    }
    for (const ev of livePhases ?? []) {
      const s = stateByName.get(ev.name);
      if (!s) continue;
      if (ev.status === "start") s.started = true;
      if (ev.status === "done") {
        s.started = true;
        s.done = true;
        s.ms = ev.ms ?? null;
      }
    }
    list = DEFAULT_PHASES.map((p) => {
      const s = stateByName.get(p.name)!;
      return {
        label: p.label,
        ms: s.ms,
        done: s.done,
        active: s.started && !s.done,
      };
    });
  }

  const allDone = list.every((p) => p.done);
  const showSpinner = streaming && !allDone;

  return (
    <div className="rounded-2xl border border-border/60 bg-card/60 p-4 backdrop-blur-sm">
      <div className="mb-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {showSpinner ? "Đang xử lý hoá đơn…" : "Đã xử lý xong"}
        {filename && <span className="ml-1 normal-case text-muted-foreground/70"> · {filename}</span>}
      </div>
      <ul className="space-y-2">
        {list.map((p) => {
          // If streaming and nothing has started yet, mark the first item as active so the card doesn't look idle.
          return (
            <li key={p.label} className="flex items-center gap-3 text-sm">
              <span
                className={cn(
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded-full transition-colors",
                  p.done
                    ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                    : p.active
                      ? "bg-primary/15 text-primary"
                      : "bg-muted text-muted-foreground/50",
                )}
              >
                {p.done ? (
                  <Check className="h-3 w-3" strokeWidth={3} />
                ) : p.active ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <span className="h-1.5 w-1.5 rounded-full bg-current" />
                )}
              </span>
              <span className={cn("flex-1 transition-colors", !p.done && !p.active && "text-muted-foreground/60")}>
                {p.label}
              </span>
              {p.ms != null && p.ms > 0 && (
                <span className="font-mono text-[11px] text-muted-foreground">{fmtMs(p.ms)}</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
