import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import type { GraphNodeData } from "@/lib/graph/build-graph";

export function AccountNode({ data, selected }: NodeProps<{ data: GraphNodeData } & any>) {
  const d = data as GraphNodeData;
  const orphan = (d.ruleCount ?? 0) === 0;

  return (
    <div
      className={cn(
        "w-[200px] rounded-md border bg-card px-2.5 py-2 shadow-sm transition-all",
        selected ? "ring-2 ring-[#BA7517] ring-offset-1" : "",
        orphan && "border-dashed",
      )}
      style={{ borderColor: orphan ? "#A3A3A3" : "#BA7517" }}
    >
      <Handle type="target" position={Position.Left} className="!h-2 !w-2 !bg-[#BA7517]" />

      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-[#BA7517]">
        <Wallet className="h-3 w-3" />
        Tài khoản
      </div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className="text-[16px] font-bold tabular-nums leading-none">{d.label}</span>
      </div>
      <div className="mt-0.5 line-clamp-1 text-[10.5px] text-muted-foreground">{d.sub}</div>
      <div className="text-[10px] text-muted-foreground">{d.ruleCount ?? 0} quy tắc dùng</div>
    </div>
  );
}
