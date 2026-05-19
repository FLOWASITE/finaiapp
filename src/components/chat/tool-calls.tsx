import { useState } from "react";
import { ChevronRight, Database, Loader2, Sparkles, CheckCircle2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export type ToolEvent =
  | { type: "tool-call"; toolCallId: string; toolName: string; input: any }
  | { type: "tool-result"; toolCallId: string; output: any; isError?: boolean };

const TOOL_META: Record<string, { label: string; Icon: any }> = {
  runQuery: { label: "Truy vấn dữ liệu", Icon: Database },
  proposeAction: { label: "Đề xuất hành động", Icon: Sparkles },
};

type Call = {
  id: string;
  toolName: string;
  input: any;
  output?: any;
  isError?: boolean;
  done: boolean;
};

function groupEvents(events: ToolEvent[]): Call[] {
  const map = new Map<string, Call>();
  for (const ev of events) {
    if (ev.type === "tool-call") {
      map.set(ev.toolCallId, {
        id: ev.toolCallId,
        toolName: ev.toolName,
        input: ev.input,
        done: false,
      });
    } else {
      const c = map.get(ev.toolCallId);
      if (c) {
        c.output = ev.output;
        c.isError = ev.isError || (ev.output && typeof ev.output === "object" && "error" in ev.output);
        c.done = true;
      } else {
        map.set(ev.toolCallId, {
          id: ev.toolCallId,
          toolName: "unknown",
          input: null,
          output: ev.output,
          isError: ev.isError,
          done: true,
        });
      }
    }
  }
  return Array.from(map.values());
}

function truncate(v: any, max = 4000): string {
  try {
    const s = typeof v === "string" ? v : JSON.stringify(v, null, 2);
    return s.length > max ? s.slice(0, max) + `\n… (cắt bớt ${s.length - max} ký tự)` : s;
  } catch {
    return String(v);
  }
}

export function ToolCalls({ events }: { events: ToolEvent[] }) {
  const calls = groupEvents(events);
  if (!calls.length) return null;
  return (
    <div className="mb-3 space-y-2">
      {calls.map((c) => (
        <ToolCallRow key={c.id} call={c} />
      ))}
    </div>
  );
}

function ToolCallRow({ call }: { call: Call }) {
  const [open, setOpen] = useState(false);
  const meta = TOOL_META[call.toolName] ?? { label: call.toolName, Icon: Sparkles };
  const Icon = meta.Icon;
  const status = !call.done ? "running" : call.isError ? "error" : "done";

  return (
    <div className="overflow-hidden rounded-xl border border-primary/15 bg-primary/[0.03] text-xs backdrop-blur-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2.5 px-3 py-2 transition-colors hover:bg-primary/[0.06]"
      >
        <ChevronRight
          className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", open && "rotate-90")}
        />
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Icon className="h-3.5 w-3.5" />
        </span>
        <span className="font-medium text-foreground">{meta.label}</span>
        {call.input?.table && (
          <span className="rounded-md bg-muted/60 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
            {String(call.input.table)}
          </span>
        )}
        {call.input?.tool_name && (
          <span className="rounded-md bg-muted/60 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
            {String(call.input.tool_name)}
          </span>
        )}
        <span className="ml-auto inline-flex items-center gap-1.5">
          {status === "running" && (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
              <Loader2 className="h-3 w-3 animate-spin" />
              Đang chạy
            </span>
          )}
          {status === "done" && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-3 w-3" />
              Xong
            </span>
          )}
          {status === "error" && (
            <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-medium text-destructive">
              <AlertCircle className="h-3 w-3" />
              Lỗi
            </span>
          )}
        </span>
      </button>
      {open && (
        <div className="space-y-2 border-t border-primary/10 bg-background/40 p-2.5 backdrop-blur">
          {call.input != null && (
            <div>
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Tham số
              </div>
              <pre className="chat-scroll overflow-x-auto rounded-lg border border-border/40 bg-muted/30 p-2 font-mono text-[11px] leading-relaxed">
                {truncate(call.input)}
              </pre>
            </div>
          )}
          {call.output !== undefined && (
            <div>
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Kết quả
              </div>
              <pre className="chat-scroll overflow-x-auto rounded-lg border border-border/40 bg-muted/30 p-2 font-mono text-[11px] leading-relaxed">
                {truncate(call.output)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
