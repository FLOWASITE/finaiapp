import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Sparkles, Zap, PauseCircle, Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import type { GraphNodeData } from "@/lib/graph/build-graph";

export function RuleNode({ data, selected }: NodeProps<{ data: GraphNodeData } & any>) {
  const d = data as GraphNodeData;
  const mode = d.mode ?? "suggest";
  const ModeIcon =
    mode === "auto" ? Zap : mode === "suggest" ? Eye : mode === "disabled" ? PauseCircle : Sparkles;
  const modeLabel =
    mode === "auto" ? "AUTO" : mode === "suggest" ? "ĐỀ XUẤT" : mode === "disabled" ? "TẮT" : "HỌC";
  const isDisabled = d.status === "paused" || d.status === "disabled" || mode === "disabled";

  return (
    <div
      className={cn(
        "w-[200px] rounded-md border bg-card px-2.5 py-2 shadow-sm transition-all",
        selected ? "ring-2 ring-[#4F46C7] ring-offset-1" : "",
        isDisabled && "opacity-60",
      )}
      style={{ borderColor: isDisabled ? "#A3A3A3" : "#4F46C7" }}
    >
      <Handle type="target" position={Position.Left} className="!h-2 !w-2 !bg-[#4F46C7]" />
      <Handle type="source" position={Position.Right} className="!h-2 !w-2 !bg-[#4F46C7]" />

      <div className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide">
        <span
          className="inline-flex items-center gap-0.5 rounded-sm px-1 py-[1px] text-white"
          style={{ backgroundColor: isDisabled ? "#737373" : "#4F46C7" }}
        >
          <ModeIcon className="h-2.5 w-2.5" />
          {modeLabel}
        </span>
        {d.accuracy != null && (
          <span className="ml-auto text-[10px] font-semibold text-emerald-700">
            {(d.accuracy * 100).toFixed(0)}%
          </span>
        )}
      </div>
      <div className="mt-1 line-clamp-2 text-[11.5px] font-medium leading-snug text-foreground">
        {d.label}
      </div>
      <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground">
        <span>{d.appliedCount ?? 0} lần áp dụng</span>
      </div>
    </div>
  );
}
