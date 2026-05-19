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
    <div className="mb-2 space-y-1.5">
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
    <div className="overflow-hidden rounded-lg border border-white/10 bg-muted/30 text-xs">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-1.5 hover:bg-white/5"
      >
        <ChevronRight
          className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", open && "rotate-90")}
        />
        <Icon className="h-3.5 w-3.5 text-primary" />
        <span className="font-medium">{meta.label}</span>
        {call.input?.table && (
          <span className="font-mono text-[10px] text-muted-foreground">{String(call.input.table)}</span>
        )}
        {call.input?.tool_name && (
          <span className="font-mono text-[10px] text-muted-foreground">{String(call.input.tool_name)}</span>
        )}
        <span className="ml-auto inline-flex items-center gap-1">
          {status === "running" && (
            <>
              <Loader2 className="h-3 w-3 animate-spin" />
              <span className="text-muted-foreground">Đang chạy…</span>
            </>
          )}
          {status === "done" && (
            <>
              <CheckCircle2 className="h-3 w-3 text-emerald-500" />
              <span className="text-muted-foreground">Xong</span>
            </>
          )}
          {status === "error" && (
            <>
              <AlertCircle className="h-3 w-3 text-destructive" />
              <span className="text-destructive">Lỗi</span>
            </>
          )}
        </span>
      </button>
      {open && (
        <div className="border-t border-white/10 bg-background/40 p-2 space-y-2">
          {call.input != null && (
            <div>
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Tham số
              </div>
              <pre className="overflow-x-auto rounded bg-muted/40 p-2 font-mono text-[11px]">
                {truncate(call.input)}
              </pre>
            </div>
          )}
          {call.output !== undefined && (
            <div>
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Kết quả
              </div>
              <pre className="overflow-x-auto rounded bg-muted/40 p-2 font-mono text-[11px]">
                {truncate(call.output)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
